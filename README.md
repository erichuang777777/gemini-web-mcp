# web-llm-proxy

OpenAI-compatible local API server that drives **Gemini** and **ChatGPT** web UIs via headless Playwright — no API keys required.

```
POST http://localhost:8000/v1/chat/completions
GET  http://localhost:8000/v1/models
```

Any client that speaks the OpenAI chat format works: Python `openai` SDK, LangChain, curl, Claude Desktop (via MCP), etc.

---

## Quick start (Windows)

```powershell
.\setup.ps1   # install deps, build, show cookie export instructions
.\start.ps1   # start the server
```

Manual:
```powershell
npm install && npm run build
npm start        # HTTP API on :8000
npm run mcp      # MCP server for Claude Desktop
```

---

## Layout

```
web-llm-proxy/
├── cookies/            ← drop cookie files here (gitignored)
│   └── README.md
├── src/
│   ├── backends.ts     ← Gemini + ChatGPT Playwright backends
│   ├── cookies.ts      ← cookie loading + interactive re-auth
│   ├── server.ts       ← Express HTTP API
│   ├── mcp.ts          ← MCP server
│   └── types.ts
├── .env.example
├── setup.ps1
└── start.ps1
```

---

## Cookie setup

1. Install **[Cookie-Editor](https://cookie-editor.com)** (Chrome or Firefox)
2. Log in to Gemini → Export as JSON → save as `cookies/gemini-cookies.json`
3. Log in to ChatGPT → Export as JSON → save as `cookies/chatgpt-cookies.json`

**Auto re-login**: when cookies expire the server opens a visible browser window, waits up to 5 min for you to log in, saves the new cookies, and retries the request automatically.

---

## API

### Python

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="unused")

# Basic call
r = client.chat.completions.create(
    model="gemini-2.5-pro",
    messages=[{"role": "user", "content": "Hello"}],
)
print(r.choices[0].message.content)

# Streaming
for chunk in client.chat.completions.create(
        model="gpt-4o", stream=True,
        messages=[{"role": "user", "content": "Count to 5"}]):
    print(chunk.choices[0].delta.content or "", end="", flush=True)

# Continue a conversation
r1 = client.chat.completions.create(
    model="gemini-2.0-flash",
    messages=[{"role": "user", "content": "My name is Alice"}],
    extra_body={"conversation_id": None})
conv_id = r1.model_extra["conversation_id"]

r2 = client.chat.completions.create(
    model="gemini-2.0-flash",
    messages=[{"role": "user", "content": "What is my name?"}],
    extra_body={"conversation_id": conv_id})

# Deep Research (Gemini only)
client.chat.completions.create(
    model="gemini-2.5-pro",
    messages=[{"role": "user", "content": "Research quantum computing trends"}],
    extra_body={"enable_deep_research": True})
```

### curl

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"Hello"}]}'
```

---

## Supported models

| Model | Backend |
|-------|---------|
| `gemini-2.0-flash` | Gemini |
| `gemini-2.5-pro` / `gemini-2.5-flash` | Gemini |
| `gemini-1.5-pro` / `gemini-1.5-flash` | Gemini |
| `gpt-4o` / `gpt-4o-mini` / `gpt-4.5` | ChatGPT |
| `o1` / `o1-mini` / `o3` / `o3-mini` | ChatGPT |

---

## MCP (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "web-llm": {
      "command": "node",
      "args": ["C:/path/to/web-llm-proxy/dist/mcp.js"]
    }
  }
}
```

Build first: `npm run build`

---

## Config

Copy `.env.example` to `.env` and edit:

```dotenv
GEMINI_COOKIES_PATH=./cookies/gemini-cookies.json
CHATGPT_COOKIES_PATH=./cookies/chatgpt-cookies.json
PORT=8000
LOG_LEVEL=info          # silent | info
DEFAULT_MODEL=gemini-2.0-flash
```

---

## Adding a new backend

1. Add a class implementing the `Backend` interface in `src/backends.ts`
2. Register its model names in `src/server.ts` and add a branch in `pickBackend()`
3. Repeat for `src/mcp.ts`
