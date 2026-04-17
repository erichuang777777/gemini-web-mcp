#!/usr/bin/env tsx
// scripts/export-cookies.ts — 自動匯出 Google Cookie（使用真實 Chrome）
import { exportCookiesInteractive } from '../src/cookie-export.js';

const OUTPUT_PATH = process.argv[2] ?? './gemini-cookies.json';

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('   Gemini Cookie 匯出工具');
  console.log('══════════════════════════════════════════════');
  console.log('');
  console.log('即將打開瀏覽器，請在彈出視窗中登入 Google。');
  console.log('');

  await exportCookiesInteractive(OUTPUT_PATH);

  console.log('');
  console.log('下一步：重啟 Claude Desktop 即可使用 gemini_chat 工具。');
  console.log('');
}

main().catch(err => {
  console.error('❌ 失敗：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
