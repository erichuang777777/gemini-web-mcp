// src/setup.ts — Cookie 匯出設定流程
import * as path from 'path';
import * as os from 'os';
import { exportCookiesInteractive } from './cookie-export.js';

function getDefaultCookiePath(): string {
  // 儲存到使用者家目錄，避免每次更新 npm 套件後被覆蓋
  return path.join(os.homedir(), 'gemini-cookies.json');
}

export async function runSetup(outputPath?: string): Promise<void> {
  const COOKIES_PATH = outputPath ??
    process.env.GEMINI_COOKIES_PATH ??
    getDefaultCookiePath();

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('   Gemini Web MCP — 初始設定');
  console.log('══════════════════════════════════════════════');
  console.log('');
  console.log('即將打開瀏覽器，請用你的 Google 帳號登入。');
  console.log(`Cookie 將儲存到：${COOKIES_PATH}`);
  console.log('');

  await exportCookiesInteractive(COOKIES_PATH);

  console.log('');
  console.log('下一步：將以下設定加入 Claude Desktop 的 claude_desktop_config.json：');
  console.log('');

  const config = {
    mcpServers: {
      'gemini-web': {
        command: 'npx',
        args: ['-y', 'gemini-web-mcp'],
        env: {
          GEMINI_COOKIES_PATH: path.resolve(COOKIES_PATH),
          GEMINI_LANGUAGE: 'zh-TW',
        },
      },
    },
  };
  console.log(JSON.stringify(config, null, 2));
  console.log('');
}
