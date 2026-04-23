import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { CookieJar, interactiveReauth } from './cookies.js';
import type { Backend, BackendChatOptions, ChatResult } from './types.js';

const TIMEOUT_MS = 120_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Gemini ───────────────────────────────────────────────────────────────────

const GEMINI_MODEL_PARAM: Record<string, string> = {
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-1.5-flash': 'gemini-1.5-flash',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
};

export class GeminiBackend implements Backend {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly cookiesPath: string;

  constructor(cookiesPath: string) { this.cookiesPath = cookiesPath; }

  private async ensurePage(retried = false): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;

    let jar: CookieJar;
    try {
      jar = CookieJar.fromFile(this.cookiesPath);
    } catch {
      if (retried) throw new Error(`Gemini cookie file not found: ${this.cookiesPath}`);
      await interactiveReauth(this.cookiesPath, 'https://gemini.google.com',
        u => u.includes('gemini.google.com') && !u.includes('accounts.google.com'));
      return this.ensurePage(true);
    }
    if (!jar.hasGeminiCookies()) {
      if (retried) throw new Error(`Gemini cookies invalid after re-login: ${this.cookiesPath}`);
      await interactiveReauth(this.cookiesPath, 'https://gemini.google.com',
        u => u.includes('gemini.google.com') && !u.includes('accounts.google.com'));
      return this.ensurePage(true);
    }

    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
    this.context = await this.browser.newContext({ userAgent: UA });
    await this.context.addCookies(jar.toPlaywrightCookies('.google.com'));
    this.page = await this.context.newPage();
    await this.page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    if (this.page.url().includes('accounts.google.com')) {
      await this.close();
      if (retried) throw new Error('Gemini re-login failed');
      await interactiveReauth(this.cookiesPath, 'https://gemini.google.com',
        u => u.includes('gemini.google.com') && !u.includes('accounts.google.com'));
      return this.ensurePage(true);
    }
    return this.page;
  }

  async chat(options: BackendChatOptions): Promise<ChatResult> {
    const { prompt, model, conversationId, enableDeepResearch } = options;
    const page = await this.ensurePage();

    if (conversationId) {
      if (!page.url().includes(conversationId)) {
        await page.goto(`https://gemini.google.com/app/${conversationId}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(1000);
      }
    } else {
      if (page.url().match(/\/app\/[0-9a-f]{16}/i)) {
        await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(1000);
      }
      const slug = GEMINI_MODEL_PARAM[model];
      if (slug) {
        await page.goto(`https://gemini.google.com/app?model=${slug}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      }
    }

    if (enableDeepResearch) await this.enableDeepResearch(page);

    const editorSelectors = [
      'div.ql-editor[contenteditable="true"]',
      'rich-textarea .ql-editor',
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
    if (!editor) throw new Error('Cannot find Gemini input box');

    await editor.click();
    await editor.fill('');
    await page.keyboard.type(prompt, { delay: 5 });
    await page.keyboard.press('Enter');

    const text = await this.waitForResponse(page);
    const convMatch = page.url().match(/\/app\/([0-9a-f]{16})/i);
    return { text, conversationId: convMatch?.[1] ?? conversationId ?? '' };
  }

  private async enableDeepResearch(page: Page): Promise<void> {
    for (const sel of ['button[aria-label*="Deep Research" i]', '[data-test-id*="deep-research"]', '.deep-research-chip']) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); await page.waitForTimeout(500); return; }
      } catch { /* try next */ }
    }
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('button, [role="button"], mat-chip, .chip'))) {
        if (['deep research', 'deepresearch'].some(k => (el.textContent ?? '').toLowerCase().includes(k))) {
          (el as HTMLElement).click(); return;
        }
      }
    });
    await page.waitForTimeout(500);
  }

  private async waitForResponse(page: Page): Promise<string> {
    const start = Date.now();
    await page.waitForTimeout(2000);
    while (Date.now() - start < TIMEOUT_MS) {
      await page.waitForTimeout(1500);
      const busy = await page.evaluate(() =>
        !!document.querySelector('button[aria-label*="Stop" i], mat-icon[data-mat-icon-name="stop_circle"]')
      ).catch(() => false);
      if (!busy) break;
    }
    await page.waitForTimeout(500);

    const b64 = await page.evaluate(() => {
      for (const sel of ['message-content.model-response-text', 'model-response message-content', '[data-message-author-role="model"] .markdown', '.markdown']) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          const bytes = new TextEncoder().encode(els[els.length - 1].textContent?.trim() ?? '');
          let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
          return btoa(bin);
        }
      }
      return '';
    }).catch(() => '');

    const text = b64 ? Buffer.from(b64, 'base64').toString('utf8') : '';
    if (!text) throw new Error('Could not extract Gemini response — page structure may have changed');
    return text;
  }

  async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) await this.page.close().catch(() => {});
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    } catch { /* ignore */ }
    this.page = null; this.context = null; this.browser = null;
  }
}

// ── ChatGPT ──────────────────────────────────────────────────────────────────

const CHATGPT_MODEL_PARAM: Record<string, string> = {
  'gpt-4o': 'gpt-4o', 'gpt-4o-mini': 'gpt-4o-mini',
  'o1': 'o1', 'o1-mini': 'o1-mini', 'o3': 'o3', 'o3-mini': 'o3-mini',
  'gpt-4.5': 'gpt-4-5',
};

export class ChatGPTBackend implements Backend {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly cookiesPath: string;

  constructor(cookiesPath: string) { this.cookiesPath = cookiesPath; }

  private async ensurePage(retried = false): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;

    let jar: CookieJar;
    try {
      jar = CookieJar.fromFile(this.cookiesPath);
    } catch {
      if (retried) throw new Error(`ChatGPT cookie file not found: ${this.cookiesPath}`);
      await interactiveReauth(this.cookiesPath, 'https://chatgpt.com',
        u => u.includes('chatgpt.com') && !u.includes('auth.openai.com') && !u.includes('/auth/'));
      return this.ensurePage(true);
    }

    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
    this.context = await this.browser.newContext({ userAgent: UA });
    await this.context.addCookies(jar.toPlaywrightCookies('.openai.com'));
    this.page = await this.context.newPage();
    await this.page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const url = this.page.url();
    if (url.includes('auth.openai.com') || url.includes('/auth/login')) {
      await this.close();
      if (retried) throw new Error('ChatGPT re-login failed');
      await interactiveReauth(this.cookiesPath, 'https://chatgpt.com',
        u => u.includes('chatgpt.com') && !u.includes('auth.openai.com') && !u.includes('/auth/'));
      return this.ensurePage(true);
    }
    return this.page;
  }

  async chat(options: BackendChatOptions): Promise<ChatResult> {
    const { prompt, model, conversationId } = options;
    const page = await this.ensurePage();

    if (conversationId) {
      if (!page.url().includes(conversationId)) {
        await page.goto(`https://chatgpt.com/c/${conversationId}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      }
    } else {
      const param = CHATGPT_MODEL_PARAM[model];
      await page.goto(param ? `https://chatgpt.com/?model=${param}` : 'https://chatgpt.com',
        { waitUntil: 'domcontentloaded', timeout: 20_000 });
    }

    const composer = '#prompt-textarea, [contenteditable="true"][data-virtualkeyboard="true"], textarea[data-id="root"]';
    try { await page.waitForSelector(composer, { timeout: 15_000 }); }
    catch { throw new Error('Cannot find ChatGPT input box'); }

    await page.click(composer);
    await page.keyboard.type(prompt, { delay: 5 });
    await page.keyboard.press('Enter');

    const text = await this.waitForResponse(page);
    const convMatch = page.url().match(/\/c\/([a-z0-9-]+)/);
    return { text, conversationId: convMatch?.[1] ?? conversationId ?? '' };
  }

  private async waitForResponse(page: Page): Promise<string> {
    await page.waitForTimeout(1500);
    try {
      await page.waitForFunction(() => !document.querySelector('[data-testid="stop-button"]'),
        { timeout: TIMEOUT_MS, polling: 1000 });
    } catch { /* timeout */ }
    await page.waitForTimeout(800);

    const b64 = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      const raw = msgs[msgs.length - 1]?.textContent?.trim() ?? '';
      if (!raw) return '';
      const bytes = new TextEncoder().encode(raw);
      let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
      return btoa(bin);
    });

    const text = b64 ? Buffer.from(b64, 'base64').toString('utf8') : '';
    if (!text) throw new Error('Could not extract ChatGPT response — page structure may have changed');
    return text;
  }

  async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) await this.page.close().catch(() => {});
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    } catch { /* ignore */ }
    this.page = null; this.context = null; this.browser = null;
  }
}
