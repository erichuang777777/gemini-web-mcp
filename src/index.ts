#!/usr/bin/env node
// src/index.ts — MCP Server 入口點（兼支援 setup 指令）
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GeminiClient } from './gemini-client.js';
import { registerTools } from './tools.js';
import { runSetup } from './setup.js';
import { log } from './logger.js';

// 若第一個參數是 setup，執行登入工具
if (process.argv[2] === 'setup') {
  runSetup().catch(err => {
    process.stderr.write(`❌ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
} else {
  startMcpServer();
}

async function startMcpServer() {
  const COOKIES_PATH = process.env.GEMINI_COOKIES_PATH ?? './gemini-cookies.json';

  log(`啟動 Gemini Web MCP Server v2.0.0`);
  log(`Cookie 文件：${COOKIES_PATH}`);

  let client: GeminiClient;
  try {
    client = new GeminiClient(COOKIES_PATH);
  } catch (err) {
    log(`錯誤：無法初始化客戶端 — ${err instanceof Error ? err.message : String(err)}`);
    log(`請執行 node dist/index.js setup 來設定 Cookie`);
    process.exit(1);
  }

  try {
    await client.initialize();
    log(`瀏覽器初始化成功`);
  } catch (err) {
    log(`警告：瀏覽器預初始化失敗 — ${err instanceof Error ? err.message : String(err)}`);
  }

  const server = new McpServer({ name: 'gemini-web-mcp', version: '2.0.0' });
  registerTools(server, client);

  const cleanup = async () => {
    log('正在關閉瀏覽器...');
    await client.cleanup();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`MCP Server 已連線，等待請求...`);
}
