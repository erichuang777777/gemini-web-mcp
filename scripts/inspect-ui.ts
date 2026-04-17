#!/usr/bin/env tsx
// 找 model switcher 和 Deep Research 的 DOM selector
import { chromium } from 'playwright';
import { CookieJar } from '../src/cookies.js';

const jar = CookieJar.fromFile('./gemini-cookies.json');
const browser = await chromium.launch({ headless: false }); // 開視窗方便觀察
const context = await browser.newContext({
  locale: 'zh-TW',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
});
await context.addCookies(jar.toPlaywrightCookies());
const page = await context.newPage();
await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 30_000 });
await page.waitForTimeout(3000);

console.log('\n=== Model Switcher 相關元素 ===');
const modelElements = await page.evaluate(() => {
  const results: Array<Record<string, string>> = [];
  document.querySelectorAll('button, mat-select, [role="button"], [role="option"], [role="combobox"], [role="listbox"]').forEach(el => {
    const txt = (el.textContent ?? '').trim();
    const aria = el.getAttribute('aria-label') ?? '';
    const cls = el.className ?? '';
    if (txt.toLowerCase().includes('pro') || txt.toLowerCase().includes('flash') ||
        txt.toLowerCase().includes('gemini') || aria.toLowerCase().includes('model') ||
        aria.toLowerCase().includes('pro') || aria.toLowerCase().includes('flash') ||
        cls.toLowerCase().includes('model') || cls.toLowerCase().includes('version')) {
      results.push({ tag: el.tagName, class: cls.slice(0,80), aria, text: txt.slice(0,60), id: el.id });
    }
  });
  return results;
});
console.log(JSON.stringify(modelElements, null, 2));

console.log('\n=== Deep Research 相關元素 ===');
const drElements = await page.evaluate(() => {
  const results: Array<Record<string, string>> = [];
  document.querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"], mat-chip, .chip').forEach(el => {
    const txt = (el.textContent ?? '').trim();
    const aria = el.getAttribute('aria-label') ?? '';
    const cls = el.className ?? '';
    if (txt.toLowerCase().includes('deep') || txt.toLowerCase().includes('research') ||
        txt.toLowerCase().includes('深度') || aria.toLowerCase().includes('deep') ||
        aria.toLowerCase().includes('research') || cls.toLowerCase().includes('deep') ||
        cls.toLowerCase().includes('research')) {
      results.push({ tag: el.tagName, class: cls.slice(0,80), aria, text: txt.slice(0,80), id: el.id });
    }
  });
  return results;
});
console.log(JSON.stringify(drElements, null, 2));

console.log('\n=== 輸入框附近所有按鈕 ===');
const inputAreaBtns = await page.evaluate(() => {
  const results: Array<Record<string, string>> = [];
  // 找輸入框
  const input = document.querySelector('div.ql-editor[contenteditable="true"]') ??
                document.querySelector('rich-textarea') ??
                document.querySelector('[contenteditable="true"]');
  if (!input) return [{ error: '找不到輸入框' }];

  // 往上找 3 層父元素，再找所有按鈕
  let parent: Element | null = input;
  for (let i = 0; i < 6; i++) parent = parent?.parentElement ?? null;
  if (!parent) return [{ error: '找不到父元素' }];

  parent.querySelectorAll('button, [role="button"], mat-icon-button').forEach(el => {
    const txt = (el.textContent ?? '').trim();
    const aria = el.getAttribute('aria-label') ?? '';
    const cls = el.className ?? '';
    results.push({ tag: el.tagName, class: cls.slice(0,80), aria, text: txt.slice(0,60) });
  });
  return results;
});
console.log(JSON.stringify(inputAreaBtns, null, 2));

await page.waitForTimeout(5000); // 停 5 秒讓你看畫面
await browser.close();
