import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CookieJar } from '../src/cookies.js';

const SAMPLE_COOKIES = [
  {
    name: 'SAPISID',
    value: 'abc123',
    domain: '.google.com',
    path: '/',
    secure: true,
    httpOnly: false,
    expirationDate: Math.floor(Date.now() / 1000) + 3600,
  },
  {
    name: 'SID',
    value: 'sid_value',
    domain: '.google.com',
    path: '/',
    secure: true,
    httpOnly: true,
    expirationDate: Math.floor(Date.now() / 1000) + 3600,
  },
];

describe('CookieJar', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-cookies-${Date.now()}.json`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('loads cookies from a JSON file', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(SAMPLE_COOKIES));
    const jar = CookieJar.fromFile(tmpFile);
    expect(jar.count()).toBe(2);
  });

  it('throws when file does not exist', () => {
    expect(() => CookieJar.fromFile('/nonexistent/path.json')).toThrow();
  });

  it('hasRequiredCookies returns true when SAPISID and SID present', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(SAMPLE_COOKIES));
    const jar = CookieJar.fromFile(tmpFile);
    expect(jar.hasRequiredCookies()).toBe(true);
  });

  it('hasRequiredCookies returns false when required cookies missing', () => {
    const minimal = [{ name: 'NID', value: 'nid_value', domain: '.google.com', path: '/' }];
    fs.writeFileSync(tmpFile, JSON.stringify(minimal));
    const jar = CookieJar.fromFile(tmpFile);
    expect(jar.hasRequiredCookies()).toBe(false);
  });

  it('getCookie returns value for named cookie', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(SAMPLE_COOKIES));
    const jar = CookieJar.fromFile(tmpFile);
    expect(jar.getCookie('SAPISID')).toBe('abc123');
  });

  it('getCookie returns undefined for missing cookie', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(SAMPLE_COOKIES));
    const jar = CookieJar.fromFile(tmpFile);
    expect(jar.getCookie('NONEXISTENT')).toBeUndefined();
  });

  it('toPlaywrightCookies returns correctly shaped objects', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(SAMPLE_COOKIES));
    const jar = CookieJar.fromFile(tmpFile);
    const pw = jar.toPlaywrightCookies();
    expect(pw).toHaveLength(2);
    expect(pw[0]).toMatchObject({ name: 'SAPISID', value: 'abc123', sameSite: 'None' });
  });
});
