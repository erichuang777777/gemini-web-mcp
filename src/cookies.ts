// Supports browser extension JSON, Playwright storage-state, Netscape .txt
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

interface RawCookie {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  expires?: number;
}

interface NormalizedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires?: number;
}

export class CookieJar {
  private cookies: NormalizedCookie[] = [];

  static fromFile(cookiesPath: string): CookieJar {
    const resolved = path.isAbsolute(cookiesPath)
      ? cookiesPath
      : path.resolve(process.cwd(), cookiesPath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`Cookie file not found: ${resolved}`);
    }

    const jar = new CookieJar();
    const content = fs.readFileSync(resolved, 'utf-8').trim();
    const ext = path.extname(resolved).toLowerCase();

    if (ext === '.txt' || content.startsWith('#')) {
      jar.cookies = CookieJar.parseNetscape(content);
    } else {
      let parsed: unknown;
      try { parsed = JSON.parse(content); } catch {
        throw new Error(`Cannot parse cookie JSON: ${resolved}`);
      }
      if (Array.isArray(parsed)) {
        jar.cookies = (parsed as RawCookie[]).map(CookieJar.normalize);
      } else if (
        typeof parsed === 'object' && parsed !== null &&
        'cookies' in parsed &&
        Array.isArray((parsed as { cookies: unknown[] }).cookies)
      ) {
        jar.cookies = ((parsed as { cookies: RawCookie[] }).cookies).map(CookieJar.normalize);
      } else {
        throw new Error('Unrecognized cookie format (expected array or Playwright storage-state)');
      }
    }

    jar.cookies = jar.cookies.filter(c => c.name && c.value);
    return jar;
  }

  private static normalize(raw: RawCookie): NormalizedCookie {
    return {
      name: String(raw.name ?? ''),
      value: String(raw.value ?? ''),
      domain: String(raw.domain ?? ''),
      path: String(raw.path ?? '/'),
      secure: Boolean(raw.secure),
      httpOnly: Boolean(raw.httpOnly),
      expires: raw.expirationDate ?? raw.expires,
    };
  }

  private static parseNetscape(content: string): NormalizedCookie[] {
    const results: NormalizedCookie[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length < 7) continue;
      const name = parts[5] ?? '';
      if (!name) continue;
      results.push({
        domain: parts[0] ?? '',
        path: parts[2] ?? '/',
        secure: parts[3]?.toUpperCase() === 'TRUE',
        expires: parseInt(parts[4]) || undefined,
        name,
        value: (parts[6] ?? '').trim(),
        httpOnly: false,
      });
    }
    return results;
  }

  hasGeminiCookies(): boolean {
    const names = new Set(this.cookies.map(c => c.name));
    const hasSapisid = names.has('SAPISID') || names.has('__Secure-1PAPISID');
    const hasSid = names.has('SID') || names.has('__Secure-1PSID') || names.has('__Secure-3PSID');
    return hasSapisid && hasSid;
  }

  hasChatGPTCookies(): boolean {
    const names = new Set(this.cookies.map(c => c.name));
    return (
      names.has('__Secure-next-auth.session-token') ||
      names.has('_puid') ||
      names.has('oai-sc') ||
      [...names].some(n => n.includes('session') || n.includes('auth'))
    );
  }

  toPlaywrightCookies(defaultDomain: string): Array<{
    name: string; value: string; domain: string; path: string;
    secure: boolean; httpOnly: boolean; expires: number;
    sameSite: 'Strict' | 'Lax' | 'None';
  }> {
    return this.cookies
      .filter(c => c.name && c.value)
      .map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || defaultDomain,
        path: c.path || '/',
        secure: c.secure,
        httpOnly: c.httpOnly,
        expires: c.expires ?? -1,
        sameSite: 'None' as const,
      }));
  }

  count(): number { return this.cookies.length; }
}

// ── Interactive re-auth ───────────────────────────────────────────────────────

const LOGIN_TIMEOUT_MS = 300_000;

export async function interactiveReauth(
  cookiesPath: string,
  loginUrl: string,
  isLoggedIn: (url: string) => boolean,
): Promise<void> {
  console.log('\n[AUTH] Cookies expired — opening browser for re-login...');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  console.log('[AUTH] Please log in. Waiting up to 5 minutes...');

  try {
    await page.waitForURL((url) => isLoggedIn(url.toString()), { timeout: LOGIN_TIMEOUT_MS });
  } catch {
    await browser.close();
    throw new Error('[AUTH] Re-login timed out (5 min). Restart the server after logging in manually.');
  }

  await page.waitForTimeout(2000);
  const cookies = await context.cookies();
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2), 'utf8');

  await browser.close();
  console.log(`[AUTH] Login complete — cookies saved to ${cookiesPath}\n`);
}
