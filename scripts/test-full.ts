#!/usr/bin/env tsx
// scripts/test-full.ts — 完整功能測試
import { GeminiClient } from '../src/gemini-client.js';

const COOKIES_PATH = './gemini-cookies.json';

async function main() {
  console.log('🔑 啟動完整測試\n');
  const client = new GeminiClient(COOKIES_PATH);
  await client.initialize();

  // 測試 1：認證
  console.log('=== 測試 1：認證 ===');
  const auth = await client.checkAuth();
  console.log(`  authenticated: ${auth.authenticated}, userId: ${auth.userId}\n`);

  // 測試 2：新對話
  console.log('=== 測試 2：新對話 ===');
  const r1 = await client.chat({ message: '台灣的首都是哪裡？請用一句話回答。' });
  console.log(`  conversationId: ${r1.conversationId}`);
  console.log(`  answer: ${r1.answerText.slice(0, 100)}\n`);

  // 測試 3：繼續對話
  if (r1.conversationId) {
    console.log('=== 測試 3：繼續對話 ===');
    const r2 = await client.chat({
      message: '那人口大約有多少？',
      conversationId: r1.conversationId,
    });
    console.log(`  conversationId: ${r2.conversationId}`);
    console.log(`  answer: ${r2.answerText.slice(0, 100)}\n`);
  }

  // 測試 4：獲取歷史
  if (r1.conversationId) {
    console.log('=== 測試 4：對話歷史 ===');
    const history = await client.getHistory(r1.conversationId);
    console.log(`  messageCount: ${history.length}`);
    for (const m of history) {
      console.log(`  [${m.role}] ${m.text.slice(0, 60)}...`);
    }
  }

  await client.cleanup();
  console.log('\n✅ 所有測試完成');
}

main().catch(async (err) => {
  console.error('❌ 致命錯誤：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
