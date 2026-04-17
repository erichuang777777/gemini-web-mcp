// src/gemini-client.ts — Playwright-based Gemini client
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { CookieJar } from './cookies.js';
import { GeminiAuthError, GeminiNetworkError } from './errors.js';
import { log } from './logger.js';
import type {
  ModelName,
  ChatOptions,
  ConversationResult,
  ConversationMessage,
  AuthStatus,
  ConversationInfo,
  UploadResult,
  DeepResearchResult,
} from './types.js';
import { getTimeoutForModel } from './timeout-config.js';

// DOM text patterns for each model
const MODEL_DISPLAY_NAMES: Record<ModelName, string[]> = {
  'auto':                 [],
  'gemini-2.0-flash':     ['2.0 flash', 'gemini 2.0 flash'],
  'gemini-1.5-pro':       ['1.5 pro', 'gemini 1.5 pro'],
  'gemini-1.5-flash':     ['1.5 flash', 'gemini 1.5 flash'],
  'gemini-1.5-pro-001':   ['1.5 pro', 'gemini 1.5 pro'],
};

export class GeminiClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cookiesPath: string;
  private language: string;
  private initializedAt = 0;

  constructor(cookiesPath: string, language = 'zh-TW') {
    const jar = CookieJar.fromFile(cookiesPath);
    if (!jar.hasRequiredCookies()) {
      throw new GeminiAuthError(
        'Cookie 文件缺少必要的 Google Session Cookies（需要 SAPISID 和 SID）。'
      );
    }
    this.cookiesPath = cookiesPath;
    this.language = process.env.GEMINI_LANGUAGE ?? language;
  }

  async initialize(): Promise<void> {
    await this.ensureBrowser();
  }

  private async ensureBrowser(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    log('啟動 Playwright 瀏覽器...');
    const jar = CookieJar.fromFile(this.cookiesPath);
    const playwrightCookies = jar.toPlaywrightCookies();

    this.browser = await chromium.launch({
      headless: true,
      args: [
        `--lang=${this.language}`,
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });

    this.context = await this.browser.newContext({
      locale: this.language,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    });

    await this.context.addCookies(playwrightCookies);
    this.page = await this.context.newPage();
    log('導航到 Gemini...');
    await this.page.goto('https://gemini.google.com/app', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    if (this.page.url().includes('accounts.google.com')) {
      await this.cleanup();
      throw new GeminiAuthError('Cookie 無效或已過期：被重導向到登入頁。請重新匯出 Cookie。');
    }

    this.initializedAt = Date.now();
    log('Gemini 頁面載入成功');
    return this.page;
  }

  async checkAuth(): Promise<AuthStatus> {
    try {
      const page = await this.ensureBrowser();
      const isGemini = page.url().includes('gemini.google.com');
      let userId = '';
      try {
        userId = await page.evaluate(() => {
          const wiz = (window as unknown as Record<string, unknown>)['WIZ_global_data'] as Record<string, string> | undefined;
          return wiz?.['S06Grb'] ?? '';
        });
      } catch { /* ignore */ }
      return {
        authenticated: isGemini && !!userId,
        userId,
        sessionAgeMs: this.initializedAt ? Date.now() - this.initializedAt : 0,
      };
    } catch {
      return { authenticated: false, userId: '' };
    }
  }

  async chat(options: ChatOptions): Promise<ConversationResult> {
    const page = await this.ensureBrowser();
    const timeout = getTimeoutForModel(options.model);

    // 1. Navigate to specified conversation or create new
    if (options.conversationId) {
      if (!page.url().includes(options.conversationId)) {
        log(`Navigating to conversation ${options.conversationId}`);
        await page.goto(`https://gemini.google.com/app/${options.conversationId}`, {
          waitUntil: 'domcontentloaded', timeout: 30_000,
        });
      }
    } else {
      // New conversation: navigate to home if already in a conversation
      if (page.url().match(/\/app\/[0-9a-f]{16}/i)) {
        await page.goto('https://gemini.google.com/app', {
          waitUntil: 'domcontentloaded', timeout: 30_000,
        });
        await page.waitForTimeout(1000);
      }
    }

    // 2. Switch model if specified
    if (options.model && options.model !== 'auto') {
      await this.selectModel(options.model);
    }

    // 3. Enable Deep Research if requested
    if (options.enableSearch) {
      await this.enableDeepResearch();
    }

    // 4. Find input box
    const editorSelectors = [
      'div.ql-editor[contenteditable="true"]',
      'rich-textarea .ql-editor',
      '.text-input-field_textarea-wrapper .ql-editor',
      'div[aria-label*="prompt"][contenteditable="true"]',
      'div[contenteditable="true"]',
    ];
    let editor = null;
    for (const sel of editorSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5_000 });
        editor = await page.$(sel);
        if (editor) break;
      } catch { /* try next */ }
    }
    if (!editor) {
      throw new GeminiNetworkError('Cannot find Gemini input box. Page may not have loaded correctly.');
    }

    // 5. Type and send message
    await editor.click();
    await editor.fill('');
    await page.keyboard.type(options.message, { delay: 10 });
    await page.keyboard.press('Enter');
    log('Message sent, waiting for response...');

    // 6. Wait for response
    const answerText = await this.waitForResponse(page, timeout);

    if (!answerText) {
      throw new GeminiNetworkError(
        'Unable to get response from Gemini. Page structure may have changed or selector is invalid.'
      );
    }

    // 7. Extract conversationId from URL
    const convMatch = page.url().match(/\/app\/([0-9a-f]{16})/i);
    const conversationId = convMatch?.[1] ?? '';

    return {
      conversationId,
      answerText,
    };
  }

  // ── Model Switcher ────────────────────────────────────────────────────────
  async selectModel(model: ModelName): Promise<void> {
    if (model === 'auto') return;

    const page = await this.ensureBrowser();
    log(`Switching model to ${model}...`);

    // Try to find model selector dropdown
    const dropdownSelectors = [
      'mat-select[data-test-ms-model-selector]',
      '[aria-label*="model" i]',
      '[aria-label*="Model" i]',
      'button[data-test-id*="model"]',
      '.model-selector button',
      'bard-model-selector button',
      '[data-test-id="model-selector"]',
    ];

    let opened = false;
    for (const sel of dropdownSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(800);
        opened = true;
        log(`Found model dropdown: ${sel}`);
        break;
      }
    }

    if (!opened) {
      // Fallback: find button containing model keywords
      const found = await page.evaluate(() => {
        const keywords = ['gemini', 'pro', 'flash', '1.5', '2.0', 'model'];
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (const btn of btns) {
          const txt = (btn.textContent ?? '').toLowerCase();
          const aria = (btn.getAttribute('aria-label') ?? '').toLowerCase();
          if (keywords.some(k => txt.includes(k) || aria.includes(k))) {
            (btn as HTMLElement).click();
            return (btn as HTMLElement).outerHTML.slice(0, 100);
          }
        }
        return null;
      });
      if (found) {
        log(`Found model button via text matching: ${found}`);
        await page.waitForTimeout(800);
        opened = true;
      }
    }

    if (!opened) {
      log(`Warning: could not find model switcher`);
      return;
    }

    // Find and click target model option
    const targetNames = MODEL_DISPLAY_NAMES[model];

    const clicked = await page.evaluate((names: string[]) => {
      const options = document.querySelectorAll('[role="option"], [role="menuitem"], mat-option, .model-option');
      for (const el of Array.from(options)) {
        const txt = (el.textContent ?? '').toLowerCase();
        if (names.some(n => txt.includes(n))) {
          (el as HTMLElement).click();
          return txt.slice(0, 60);
        }
      }
      return null;
    }, targetNames);

    if (clicked) {
      log(`Selected model: ${clicked}`);
      await page.waitForTimeout(500);
    } else {
      log(`Warning: could not find model option ${model}`);
      await page.keyboard.press('Escape');
    }
  }

  async getModel(): Promise<string> {
    const page = await this.ensureBrowser();
    const model = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="model" i], [data-test-id="model-selector"]');
      return btn?.textContent?.trim() ?? 'unknown';
    }).catch(() => 'unknown');
    return model;
  }

  async newChat(): Promise<void> {
    const page = await this.ensureBrowser();
    log('Creating new conversation...');

    // Try to find "New chat" button
    const newChatSelectors = [
      'button[aria-label*="new" i]',
      'button[data-test-id*="new-chat"]',
      '.new-chat-button',
    ];

    for (const sel of newChatSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(1000);
        return;
      }
    }

    // Fallback: navigate to home
    await page.goto('https://gemini.google.com/app', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  }

  async getConversation(): Promise<ConversationMessage[]> {
    const page = await this.ensureBrowser();
    const messages = await page.evaluate(() => {
      const result: ConversationMessage[] = [];

      // Find user messages
      const userMsgs = document.querySelectorAll('.query-text, user-query .query-text, [data-message-author-role="user"]');
      const modelMsgs = document.querySelectorAll('message-content.model-response-text, model-response message-content, [data-message-author-role="model"] .markdown');

      const maxLen = Math.max(userMsgs.length, modelMsgs.length);
      for (let i = 0; i < maxLen; i++) {
        if (userMsgs[i]) {
          result.push({ role: 'user', content: userMsgs[i].textContent?.trim() ?? '' });
        }
        if (modelMsgs[i]) {
          result.push({ role: 'assistant', content: modelMsgs[i].textContent?.trim() ?? '' });
        }
      }

      // Fallback
      if (result.length === 0) {
        document.querySelectorAll('.markdown').forEach((el, i) => {
          const text = el.textContent?.trim() ?? '';
          if (text) result.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: text });
        });
      }

      return result;
    }).catch(() => []);

    return messages.filter(m => m.content);
  }

  async listConversations(): Promise<ConversationInfo[]> {
    const page = await this.ensureBrowser();
    const conversations = await page.evaluate(() => {
      const result: ConversationInfo[] = [];

      // Find conversations in sidebar
      const convLinks = document.querySelectorAll('a[href*="/app/"]');
      for (const link of Array.from(convLinks)) {
        const href = link.getAttribute('href') ?? '';
        const match = href.match(/\/app\/([0-9a-f]{16})/i);
        if (match) {
          const title = link.textContent?.trim() ?? 'Untitled';
          result.push({
            conversationId: match[1],
            title: title || 'Untitled',
          });
        }
      }

      return result;
    }).catch(() => []);

    return conversations;
  }

  async switchConversation(conversationId: string): Promise<void> {
    const page = await this.ensureBrowser();
    log(`Switching to conversation ${conversationId}`);
    await page.goto(`https://gemini.google.com/app/${conversationId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const page = await this.ensureBrowser();
    log(`Deleting conversation ${conversationId}`);

    // Navigate to conversation first
    if (!page.url().includes(conversationId)) {
      await page.goto(`https://gemini.google.com/app/${conversationId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    }

    // Try to find delete button
    const deleteSelectors = [
      'button[aria-label*="delete" i]',
      'button[data-test-id*="delete"]',
      '.delete-button',
    ];

    for (const sel of deleteSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        // Confirm if needed
        const confirmBtn = await page.$('button[aria-label*="delete" i]').catch(() => null);
        if (confirmBtn) {
          await confirmBtn.click();
        }
        await page.waitForTimeout(1000);
        return;
      }
    }

    log('Warning: could not find delete button');
  }

  async exportConversation(format: 'markdown' | 'json'): Promise<string> {
    const messages = await this.getConversation();

    if (format === 'json') {
      return JSON.stringify(messages, null, 2);
    }

    // Markdown format
    return messages.map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      return `**${role}:**\n\n${m.content}\n`;
    }).join('\n---\n\n');
  }

  async regenerate(): Promise<ConversationResult> {
    const page = await this.ensureBrowser();
    log('Regenerating last response...');

    // Find and click regenerate button
    const regenSelectors = [
      'button[aria-label*="regenerate" i]',
      'button[data-test-id*="regenerate"]',
      '.regenerate-button',
    ];

    for (const sel of regenSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        break;
      }
    }

    // Wait for new response
    const timeout = getTimeoutForModel();
    const answerText = await this.waitForResponse(page, timeout);

    // Extract conversationId
    const convMatch = page.url().match(/\/app\/([0-9a-f]{16})/i);
    const conversationId = convMatch?.[1] ?? '';

    return {
      conversationId,
      answerText,
    };
  }

  async uploadFile(filePath: string): Promise<UploadResult> {
    const page = await this.ensureBrowser();
    log(`Uploading file: ${filePath}`);

    try {
      // Find file input
      const fileInput = await page.$('input[type="file"]');
      if (!fileInput) {
        return {
          success: false,
          message: 'Could not find file input element',
        };
      }

      // Set file
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      return {
        success: true,
        message: `File uploaded: ${filePath}`,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      return {
        success: false,
        message: `Upload failed: ${message}`,
      };
    }
  }

  async enableDeepResearch(): Promise<DeepResearchResult> {
    const page = await this.ensureBrowser();
    log('Enabling Deep Research...');

    // Try multiple selectors
    const drSelectors = [
      'button[aria-label*="Deep Research" i]',
      '[data-test-id*="deep-research"]',
      'mat-chip:has-text("Deep Research")',
      '.deep-research-chip',
    ];

    for (const sel of drSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          log(`Clicked Deep Research: ${sel}`);
          await page.waitForTimeout(500);
          return {
            success: true,
            message: 'Deep Research enabled',
          };
        }
      } catch { /* try next */ }
    }

    // Fallback: find button with deep research text
    const clicked = await page.evaluate(() => {
      const keywords = ['deep research', 'deepresearch'];
      const btns = document.querySelectorAll('button, [role="button"], mat-chip, .chip');
      for (const btn of Array.from(btns)) {
        const txt = (btn.textContent ?? '').toLowerCase().trim();
        const aria = (btn.getAttribute('aria-label') ?? '').toLowerCase();
        if (keywords.some(k => txt.includes(k) || aria.includes(k))) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      log('Deep Research enabled (text matching)');
      return {
        success: true,
        message: 'Deep Research enabled',
      };
    }

    return {
      success: false,
      message: 'Could not find Deep Research button',
    };
  }

  private async waitForResponse(page: Page, timeout: number): Promise<string> {
    const start = Date.now();

    // Wait a bit for generation to start
    await page.waitForTimeout(2000);

    while (Date.now() - start < timeout) {
      await page.waitForTimeout(1500);

      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector(
          'button[aria-label*="Stop" i], button[aria-label*="停止" i], ' +
          'mat-icon[data-mat-icon-name="stop_circle"], .stop-button'
        );
        const thinking = document.querySelector(
          '.thinking-indicator, .loading-indicator, [data-is-streaming="true"], ' +
          '.progress-indicator, [aria-label*="generating" i]'
        );
        return !!(stopBtn || thinking);
      }).catch(() => false);

      if (!isGenerating) {
        await page.waitForTimeout(1500);
        break;
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      if (elapsed % 15 === 0) log(`Response generation in progress... (${elapsed}s)`);
    }

    // Extract last model response
    const answerText = await page.evaluate(() => {
      const selectors = [
        'message-content.model-response-text',
        'model-response message-content',
        '.response-container .markdown',
        '[data-message-author-role="model"] .markdown',
        '.conversation-container model-response:last-of-type message-content',
        '.markdown',
      ];
      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        if (elements.length > 0) {
          const last = elements[elements.length - 1];
          return last.textContent?.trim() ?? '';
        }
      }
      return '';
    }).catch(() => '');

    if (!answerText) log('Warning: could not extract response text from DOM');
    return answerText;
  }


  async cleanup(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) await this.page.close().catch(() => {});
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    } catch { /* ignore */ }
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
