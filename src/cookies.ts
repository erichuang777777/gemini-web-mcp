// src/cookies.ts — 支援三種格式：瀏覽器擴充功能 JSON、Playwright storage-state、Netscape .txt
import * as fs from 'fs';
import * as path from 'path';

interface RawCookie {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  expires?: number;
  sameSite?: string;
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
    if (!fs.existsSync(cookiesPath)) {
      throw new Error(`Cookie 文件不存在：${cookiesPath}`);
    }

    const jar = new CookieJar();
    const content = fs.readFileSync(cookiesPath, 'utf-8').trim();
    const ext = path.extname(cookiesPath).toLowerCase();

    if (ext === '.txt' || content.startsWith('#')) {
      jar.cookies = CookieJar.parseNetscape(content);
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(`Cookie 文件格式無效（無法解析 JSON）：${cookiesPath}`);
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
        throw new Error('無法識別的 Cookie 格式（支援：陣列格式 / Playwright storage-state）');
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

  getCookie(name: string): string | undefined {
    return this.cookies.find(c => c.name === name)?.value;
  }

  hasRequiredCookies(): boolean {
    const names = new Set(this.cookies.map(c => c.name));
    const hasSapisid = names.has('SAPISID') || names.has('__Secure-1PAPISID');
    const hasSid = names.has('SID') || names.has('__Secure-1PSID') || names.has('__Secure-3PSID');
    return hasSapisid && hasSid;
  }

  /** 轉換為 Playwright 格式的 cookies */
  toPlaywrightCookies(): Array<{
    name: string; value: string; domain: string; path: string;
    secure: boolean; httpOnly: boolean; expires: number;
    sameSite: 'Strict' | 'Lax' | 'None';
  }> {
    return this.cookies
      .filter(c => c.name && c.value)
      .map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.google.com',
        path: c.path || '/',
        secure: c.secure,
        httpOnly: c.httpOnly,
        expires: c.expires ?? -1,
        sameSite: 'None' as const,
      }));
  }

  count(): number {
    return this.cookies.length;
  }
}
