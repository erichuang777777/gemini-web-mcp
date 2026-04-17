#!/usr/bin/env tsx
// scripts/test.ts — 測試 Playwright-based GeminiClient
import { GeminiClient } from '../src/gemini-client.js';

const COOKIES_PATH = process.argv[2] ?? './gemini-cookies.json';

async function main() {
  console.log(`🔑 Cookie 路徑：${COOKIES_PATH}\n`);
  const client = new GeminiClient(COOKIES_PATH);

  // ── 測試 1：認證狀態 ──────────────────────────────
  console.log('=== 測試 1：認證狀態 ===');
  try {
    await client.initialize();
    const auth = await client.checkAuth();
    console.log(JSON.stringify(auth, null, 2));
    if (!auth.authenticated) {
      console.error('❌ 認證失敗，停止測試');
      await client.cleanup();
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ 初始化失敗：', err instanceof Error ? err.message : String(err));
    await client.cleanup();
    process.exit(1);
  }

  // ── 測試 2：發送訊息 ──────────────────────────────
  console.log('\n=== 測試 2：發送訊息 ===');
  try {
    const result = await client.chat({ message: '1+1等於幾？請只回答數字。' });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('❌ 發送失敗：', err instanceof Error ? err.message : String(err));
  }

  await client.cleanup();
  console.log('\n✅ 測試完成');
}

main().catch(async (err) => {
  console.error('致命錯誤：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
