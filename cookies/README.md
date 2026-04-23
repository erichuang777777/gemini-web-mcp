# cookies/

Place your exported browser cookie files here:

| File | Source |
|------|--------|
| `gemini-cookies.json` | Exported from gemini.google.com session |
| `chatgpt-cookies.json` | Exported from chatgpt.com session |

## How to export cookies

Use the **Cookie-Editor** browser extension (Chrome/Firefox):

1. Log in to Gemini / ChatGPT in your browser
2. Click the Cookie-Editor icon
3. Click **Export** → **Export as JSON**
4. Save the file here with the name above

The server accepts three cookie formats:
- JSON array (Cookie-Editor default)
- Playwright storage-state (`{ cookies: [...] }`)
- Netscape cookie text (`.txt`)
