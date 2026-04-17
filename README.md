# gemini-web-mcp

讓 Claude 可以直接呼叫 **Google Gemini** 的 MCP Server。  
支援切換模型（Gemini 2.5 Pro / Flash）和 **Deep Research** 深度搜尋。

> An MCP server that lets Claude call Google Gemini, with model switching and Deep Research support.

---

## 🚀 快速開始（非程式人員）/ Quick Start

### 步驟一：安裝 Node.js

前往 [nodejs.org](https://nodejs.org) 下載並安裝 **LTS** 版本。

> Go to [nodejs.org](https://nodejs.org) and install the LTS version.

---

### 步驟二：登入並自動抓取 Cookie

打開終端機（Windows：按 `Win+R` 輸入 `cmd`，Enter；Mac：搜尋 Terminal），輸入：

```bash
npx -y gemini-web-mcp setup
```

這條指令會：
1. 自動下載所有必要元件
2. 打開你電腦上的 **Google Chrome**
3. 等你在瀏覽器中登入 Google 帳號
4. 自動儲存 Cookie 到 `~/gemini-cookies.json`

> This command will open Chrome, wait for you to log in to Google, then automatically save your cookies.

---

### 步驟三：設定 Claude Desktop

開啟 Claude Desktop 的設定檔：
- **Windows**：`%APPDATA%\Claude\claude_desktop_config.json`
- **Mac**：`~/Library/Application Support/Claude/claude_desktop_config.json`

加入以下內容（將路徑改成你的 Cookie 檔案位置）：

```json
{
  "mcpServers": {
    "gemini-web": {
      "command": "npx",
      "args": ["-y", "gemini-web-mcp"],
      "env": {
        "GEMINI_COOKIES_PATH": "C:/Users/你的名字/gemini-cookies.json",
        "GEMINI_LANGUAGE": "zh-TW"
      }
    }
  }
}
```

> Edit Claude Desktop config file, add the mcpServers entry above with your cookie file path.

---

### 步驟五：重啟 Claude Desktop

完全關閉並重新開啟 Claude Desktop。你應該會在工具列看到 Gemini 相關工具。

---

## 🛠️ 可用工具 / Available Tools

| 工具 | 說明 |
|------|------|
| `gemini_auth_status` | 確認 Cookie 是否有效 |
| `gemini_chat` | 傳送訊息給 Gemini |
| `gemini_history` | 查看對話歷史 |

### gemini_chat 參數

| 參數 | 說明 | 範例 |
|------|------|------|
| `message` | 要傳送的訊息（必填）| `"幫我分析這份資料"` |
| `conversationId` | 繼續舊對話（選填）| `"58d0100f2707c10d"` |
| `model` | 指定模型（選填）| `"2.5-pro"` |
| `deepResearch` | 深度搜尋模式（選填）| `true` |

**支援的模型：**
- `2.5-pro` — Gemini 2.5 Pro（最強，速度較慢）
- `2.5-flash` — Gemini 2.5 Flash（快速）
- `2.0-flash` — Gemini 2.0 Flash
- `2.0-flash-thinking` — Gemini 2.0 Flash Thinking（思考模式）
- `default` — 沿用目前選擇

---

## 🔄 Cookie 更新

Cookie 通常 **1-2 週**後失效。失效後重新從瀏覽器匯出覆蓋原檔案即可，不需要重啟任何服務。

> Cookies expire after 1-2 weeks. Just re-export from the browser and overwrite the file.

---

## 📝 注意事項

- 本工具使用你的 Google 帳號操作 Gemini，僅供個人學習使用
- Cookie 檔案包含帳號憑證，請勿分享給他人
- Google 可能隨時更新網頁結構，若出現問題請回報 [Issues](../../issues)

---

## 🔧 開發者安裝 / Developer Setup

```bash
git clone https://github.com/你的帳號/gemini-web-mcp.git
cd gemini-web-mcp
npm install
npx playwright install chromium
npm run build
npx tsx scripts/test.ts
```
