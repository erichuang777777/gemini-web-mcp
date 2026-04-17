// src/gemini-client.ts — Playwright-based Gemini 客戶端
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { CookieJar } from './cookies.js';
import { GeminiAuthError, GeminiNetworkError } from './errors.js';
import { log } from './logger.js';

export type GeminiModel = '2.5-pro' | '2.5-flash' | '2.0-flash' | '2.0-flash-thinking' | 'default';

export interface ChatOptions {
  message: string;
  conversationId?: string;
  model?: GeminiModel;
  deepResearch?: boolean;
}

export interface ConversationResult {
  conversationId: string;
  answerText: string;
  model?: string;
  deepResearch?: boolean;
}

export interface HistoryMessage {
  role: 'user' | 'model';
  text: string;
  messageId?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  userId: string;
  sessionAgeMs?: number;
}

// Model display name → URL param mapping
// NOTE: MODEL_MAP is only used internally by switchModel() for display name matching.
// Actual model switching uses DOM text matching (modelNames), not URL params.
// These are kept for reference and potential future URL-based switching.
const MODEL_MAP: Record<GeminiModel, string> = {
  'default':              '',
  '2.5-pro':              'gemini-2-5-pro',
  '2.5-flash':            'gemini-2-5-flash',
  '2.0-flash':            'gemini-2-0-flash',
  '2.0-flash-thinking':   'gemini-2-0-flash-thinking',
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

    // 1. 導航到指定對話或建立新對話
    if (options.conversationId) {
      if (!page.url().includes(options.conversationId)) {
        log(`導航到對話 ${options.conversationId}`);
        await page.goto(`https://gemini.google.com/app/${options.conversationId}`, {
          waitUntil: 'domcontentloaded', timeout: 30_000,
        });
      }
    } else {
      // 新對話：若目前已有對話，先導航回首頁以確保乾淨狀態
      if (page.url().match(/\/app\/[0-9a-f]{16}/i)) {
        await page.goto('https://gemini.google.com/app', {
          waitUntil: 'domcontentloaded', timeout: 30_000,
        });
        await page.waitForTimeout(1000);
      }
    }

    // 2. 切換模型（如果指定）
    if (options.model && options.model !== 'default') {
      await this.switchModel(page, options.model);
    }

    // 3. 啟用 Deep Research（如果指定）
    if (options.deepResearch) {
      await this.enableDeepResearch(page);
    }

    // 4. 等待輸入框
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
      throw new GeminiNetworkError('找不到 Gemini 輸入框。頁面可能未正確載入。');
    }

    // 5. 輸入訊息並送出
    await editor.click();
    await editor.fill('');
    await page.keyboard.type(options.message, { delay: 10 });
    await page.keyboard.press('Enter');
    log('訊息已送出，等待回覆...');

    // 6. 等待回覆完成
    const answerText = await this.waitForResponse(page, options.deepResearch);

    if (!answerText) {
      throw new GeminiNetworkError(
        '無法從 Gemini 取得回覆。可能是頁面結構變更、回覆逾時或 DOM selector 失效。'
      );
    }

    // 7. 從 URL 提取 conversationId
    const convMatch = page.url().match(/\/app\/([0-9a-f]{16})/i);
    const conversationId = convMatch?.[1] ?? '';

    return {
      conversationId,
      answerText,
      model: options.model,
      deepResearch: options.deepResearch,
    };
  }

  // ── Model Switcher ────────────────────────────────────────────────────────
  private async switchModel(page: Page, model: GeminiModel): Promise<void> {
    const modelParam = MODEL_MAP[model];
    if (!modelParam) return;

    log(`切換模型到 ${model}...`);

    // 方法 A：找下拉式 model selector 按鈕（常見 class/aria）
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
        log(`找到 model dropdown: ${sel}`);
        break;
      }
    }

    if (!opened) {
      // 方法 B：找包含目前 model 名稱的按鈕
      const found = await page.evaluate(() => {
        const keywords = ['gemini', 'pro', 'flash', '2.0', '2.5', 'model'];
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
        log(`用 text 找到 model btn: ${found}`);
        await page.waitForTimeout(800);
        opened = true;
      }
    }

    if (!opened) {
      log(`警告：找不到 model switcher，跳過切換`);
      return;
    }

    // 找並點擊目標 model 選項
    const modelNames: Record<GeminiModel, string[]> = {
      'default':            [],
      '2.5-pro':            ['2.5 pro', 'gemini 2.5 pro', '2.5pro'],
      '2.5-flash':          ['2.5 flash', 'gemini 2.5 flash', '2.5flash'],
      '2.0-flash':          ['2.0 flash', 'gemini 2.0 flash', '2.0flash'],
      '2.0-flash-thinking': ['2.0 flash thinking', 'flash thinking', 'thinking exp'],
    };
    const targetNames = modelNames[model];

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
      log(`已選擇模型：${clicked}`);
      await page.waitForTimeout(500);
    } else {
      log(`警告：找不到模型選項 ${model}，繼續使用目前模型`);
      // 按 Escape 關閉下拉選單
      await page.keyboard.press('Escape');
    }
  }

  // ── Deep Research ─────────────────────────────────────────────────────────
  private async enableDeepResearch(page: Page): Promise<void> {
    log('啟用 Deep Research...');

    // 嘗試多種 selector
    const drSelectors = [
      'button[aria-label*="Deep Research" i]',
      'button[aria-label*="深度研究" i]',
      '[data-test-id*="deep-research"]',
      'mat-chip:has-text("Deep Research")',
      '.deep-research-chip',
    ];

    for (const sel of drSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          log(`已點擊 Deep Research: ${sel}`);
          await page.waitForTimeout(500);
          return;
        }
      } catch { /* try next */ }
    }

    // fallback：找包含 deep research 文字的按鈕
    const clicked = await page.evaluate(() => {
      const keywords = ['deep research', '深度研究', 'deepresearch'];
      const btns = document.querySelectorAll('button, [role="button"], mat-chip, .chip');
      for (const btn of Array.from(btns)) {
        const txt = (btn.textContent ?? '').toLowerCase().trim();
        const aria = (btn.getAttribute('aria-label') ?? '').toLowerCase();
        if (keywords.some(k => txt.includes(k) || aria.includes(k))) {
          (btn as HTMLElement).click();
          return txt.slice(0, 60);
        }
      }
      return null;
    });

    if (clicked) {
      log(`已點擊 Deep Research（文字匹配）：${clicked}`);
      await page.waitForTimeout(500);
    } else {
      log('警告：找不到 Deep Research 按鈕，繼續不帶 Deep Research');
    }
  }

  // ── 等待回覆完成 ──────────────────────────────────────────────────────────
  private async waitForResponse(page: Page, isDeepResearch = false): Promise<string> {
    // Deep Research 可能需要更長時間（5 分鐘）
    const maxWait = isDeepResearch ? 300_000 : 120_000;
    const start = Date.now();

    // 先等一下讓生成開始
    await page.waitForTimeout(2000);

    while (Date.now() - start < maxWait) {
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

      // Deep Research 狀態：若有進度顯示，印出 log
      if (isDeepResearch) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        if (elapsed % 15 === 0) log(`Deep Research 進行中... (${elapsed}s)`);
      }
    }

    // 提取最後一則 model 回覆
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

    if (!answerText) log('警告：無法從 DOM 提取回覆文字');
    return answerText;
  }

  // ── 對話歷史 ──────────────────────────────────────────────────────────────
  async getHistory(conversationId: string): Promise<HistoryMessage[]> {
    const page = await this.ensureBrowser();
    if (!page.url().includes(conversationId)) {
      await page.goto(`https://gemini.google.com/app/${conversationId}`, {
        waitUntil: 'domcontentloaded', timeout: 30_000,
      });
      await page.waitForTimeout(2000);
    }

    const messages = await page.evaluate(() => {
      const result: Array<{ role: 'user' | 'model'; text: string }> = [];

      // 找 user 訊息
      const userMsgs = document.querySelectorAll('.query-text, user-query .query-text, [data-message-author-role="user"]');
      const modelMsgs = document.querySelectorAll('message-content.model-response-text, model-response message-content, [data-message-author-role="model"] .markdown');

      const maxLen = Math.max(userMsgs.length, modelMsgs.length);
      for (let i = 0; i < maxLen; i++) {
        if (userMsgs[i]) {
          result.push({ role: 'user', text: userMsgs[i].textContent?.trim() ?? '' });
        }
        if (modelMsgs[i]) {
          result.push({ role: 'model', text: modelMsgs[i].textContent?.trim() ?? '' });
        }
      }

      // fallback
      if (result.length === 0) {
        document.querySelectorAll('.markdown').forEach((el, i) => {
          const text = el.textContent?.trim() ?? '';
          if (text) result.push({ role: i % 2 === 0 ? 'user' : 'model', text });
        });
      }

      return result;
    }).catch(() => []);

    return messages.filter(m => m.text).map((m, i) => ({ ...m, messageId: `msg_${i}` }));
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
