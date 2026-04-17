# gemini-web-mcp

MCP server for **Google Gemini Web** — cookie-based authentication, no API key required.

**Version 2.0.0** — 13 MCP tools with model switching, conversation management, file upload, and deep research support.

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

## Features

- 🤖 **13 MCP Tools** — Complete conversation and model management
- 🔀 **Model Switching** — Switch between Gemini models (2.0-flash, 1.5-pro, 1.5-flash, etc.)
- 💬 **Conversation Management** — Create, list, switch, delete, and export conversations
- 📁 **File Upload** — Send images, PDFs, and documents to Gemini
- 🧠 **Deep Research** — Enable advanced research mode for complex queries
- 🔄 **Message Regeneration** — Regenerate Gemini's last response
- 🛡️ Cookie-based login (no Google API key needed)

## MCP Tools (13 total)

| # | Tool | Description |
|---|------|-------------|
| 1 | `gemini_auth_status` | Check authentication status |
| 2 | `gemini_chat` | Send message (supports model, deep research) |
| 3 | `gemini_new_chat` | Create new conversation |
| 4 | `gemini_select_model` | Switch model (2.0-flash, 1.5-pro, 1.5-flash, etc.) |
| 5 | `gemini_get_model` | Get current active model |
| 6 | `gemini_get_conversation` | Get all messages in current conversation |
| 7 | `gemini_list_conversations` | List all saved conversations |
| 8 | `gemini_switch_conversation` | Switch to a specific conversation |
| 9 | `gemini_delete_conversation` | Delete a conversation |
| 10 | `gemini_upload_file` | Upload files (images, PDFs) |
| 11 | `gemini_enable_deep_research` | Enable deep research mode |
| 12 | `gemini_export_conversation` | Export as markdown/JSON |
| 13 | `gemini_regenerate` | Regenerate last response |

### Tool Details

#### `gemini_chat` (Enhanced)
Send a message to Gemini with optional model switching and deep research.

| Parameter | Type | Description |
|---|---|---|
| `message` | string (required) | The message to send |
| `conversationId` | string (optional) | Continue an existing conversation |
| `model` | string (optional) | Switch model: auto, gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash, gemini-1.5-pro-001 |
| `enableSearch` | boolean (optional) | Enable deep research mode |

**Response:**
```json
{
  "success": true,
  "conversationId": "abc123",
  "answer": "Gemini's response...",
  "conversationUrl": "https://gemini.google.com/app/abc123"
}
```

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
