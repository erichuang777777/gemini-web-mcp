// src/cookie-export.ts — Shared cookie export logic
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

function waitForEnter(question: string): Promise<void> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, () => { rl.close(); resolve(); });
  });
}

export function getRequiredCookieNames(): Set<string> {
  return new Set([
    'SAPISID', 'SID', 'HSID', 'SSID', 'APISID', 'SIDCC',
    '__Secure-1PSID', '__Secure-3PSID',
    '__Secure-1PAPISID', '__Secure-3PAPISID',
    '__Secure-1PSIDTS', '__Secure-3PSIDTS',
    '__Secure-1PSIDCC', '__Secure-3PSIDCC',
    '__Secure-1PSIDRTS', '__Secure-3PSIDRTS',
    'NID', 'AEC', '__Secure-BUCKET',
    '_ga', '_gcl_au',
  ]);
}

export function validateCookies(cookieNames: Set<string>): boolean {
  const hasSapisid = cookieNames.has('SAPISID') || cookieNames.has('__Secure-1PAPISID');
  const hasSid = cookieNames.has('SID') || cookieNames.has('__Secure-1PSID') || cookieNames.has('__Secure-3PSID');
  return hasSapisid && hasSid;
}

export async function exportCookiesInteractive(outputPath: string): Promise<void> {
  const requiredNames = getRequiredCookieNames();

  // 優先使用真實 Chrome
  let browser;
  let usingRealChrome = false;

  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: ['--start-maximized'],
    });
    usingRealChrome = true;
    console.log('✓ 使用電腦上的 Google Chrome');
  } catch {
    console.log('⚠ 找不到 Google Chrome，改用內建瀏覽器');
    try {
      browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox'],
      });
    } catch {
      console.log('');
      console.log('❌ 找不到瀏覽器，請先執行：');
      console.log('   npx playwright install chromium');
      process.exit(1);
    }
  }

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  await page.goto('https://gemini.google.com', {
    waitUntil: 'domcontentloaded', timeout: 15_000,
  }).catch(() => {});

  console.log('');
  console.log('👆 請在瀏覽器視窗中完成 Google 帳號登入...');
  console.log('');
  await waitForEnter('登入完成後，請按 Enter 繼續...');

  if (page.url().includes('accounts.google.com')) {
    await waitForEnter('⚠ 請完成登入後再按 Enter...');
  }

  console.log('⏳ 正在抓取 Cookies...');
  await page.goto('https://gemini.google.com/app', {
    waitUntil: 'domcontentloaded', timeout: 20_000,
  }).catch(() => {});
  await page.waitForTimeout(2000);

  const allCookies = await context.cookies([
    'https://gemini.google.com',
    'https://google.com',
    'https://accounts.google.com',
  ]);

  const googleCookies = allCookies.filter(c =>
    c.domain.includes('google.com') &&
    (requiredNames.has(c.name) || c.domain.includes('gemini'))
  );

  if (googleCookies.length === 0) {
    console.log('❌ 沒有找到 Google Cookies，請確認已完整登入。');
    await browser.close();
    process.exit(1);
  }

  const exportData = googleCookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    expirationDate: c.expires > 0 ? c.expires : undefined,
    session: c.expires === -1,
    sameSite: c.sameSite ?? null,
    storeId: null,
    hostOnly: !c.domain.startsWith('.'),
  }));

  const outputDir = path.dirname(path.resolve(outputPath));
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

  const names = new Set(exportData.map(c => c.name));
  const valid = validateCookies(names);

  await browser.close();

  console.log('');
  console.log('══════════════════════════════════════════════');
  if (valid) {
    console.log(`✅ 成功！已儲存 ${exportData.length} 個 Cookies`);
  } else {
    console.log(`⚠ 已儲存 ${exportData.length} 個 Cookies（部分必要項目缺失，建議重試）`);
  }
  console.log(`   位置：${path.resolve(outputPath)}`);
  console.log('');
  console.log('   必要 Cookies 狀態：');
  for (const name of ['SAPISID', 'SID', '__Secure-1PSID', '__Secure-3PSID']) {
    console.log(`   ${names.has(name) ? '✓' : '✗'} ${name}`);
  }
  console.log('');
  console.log('══════════════════════════════════════════════');

  if (!usingRealChrome) {
    console.log('');
    console.log('💡 建議安裝 Google Chrome 以獲得更穩定的登入體驗。');
  }
}
