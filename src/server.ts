import 'dotenv/config';
import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { GeminiBackend, ChatGPTBackend } from './backends.js';
import type { ChatRequest, Backend, OpenAIMessage } from './types.js';

function formatMessages(messages: OpenAIMessage[]): string {
  const sys = messages.find(m => m.role === 'system')?.content?.trim();
  const conv = messages.filter(m => m.role !== 'system');
  if (conv.length === 0) return sys ?? '';
  const last = conv[conv.length - 1];
  const hist = conv.slice(0, -1);
  if (hist.length === 0) return sys ? `[Instructions: ${sys}]\n\n${last.content}` : last.content;
  const parts: string[] = [];
  if (sys) parts.push(`System instructions: ${sys}\n`);
  parts.push('--- Conversation history ---');
  for (const m of hist) parts.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
  parts.push('--- End of history ---');
  parts.push(`\nPlease respond to: ${last.content}`);
  return parts.join('\n');
}

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Config ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '8000');
const GEMINI_COOKIES = process.env.GEMINI_COOKIES_PATH ?? '../gemini-web-mcp/gemini-cookies.json';
const CHATGPT_COOKIES = process.env.CHATGPT_COOKIES_PATH ?? '../chatgpt-web-mcp/chatgpt-cookies.json';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? 'gemini-2.0-flash';
const LOG = process.env.LOG_LEVEL !== 'silent';

const GEMINI_MODELS = [
  'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash',
  'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro-001',
];
const CHATGPT_MODELS = [
  'gpt-4o', 'gpt-4o-mini', 'gpt-4.5',
  'o1', 'o1-mini', 'o3', 'o3-mini',
];

// ── Backend pool (lazy-initialized, kept alive between requests) ────────────
let geminiBackend: GeminiBackend | null = null;
let chatgptBackend: ChatGPTBackend | null = null;

function pickBackend(model: string): Backend {
  if (model.startsWith('gemini')) {
    if (!geminiBackend) geminiBackend = new GeminiBackend(GEMINI_COOKIES);
    return geminiBackend;
  }
  if (!chatgptBackend) chatgptBackend = new ChatGPTBackend(CHATGPT_COOKIES);
  return chatgptBackend;
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
async function shutdown() {
  if (LOG) console.log('\nShutting down browsers...');
  await Promise.allSettled([geminiBackend?.close(), chatgptBackend?.close()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ── CORS ────────────────────────────────────────────────────────────────────
function setCors(res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
app.options('*', (_req, res) => { setCors(res); res.sendStatus(200); });

// ── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', backends: { gemini: !!geminiBackend, chatgpt: !!chatgptBackend } });
});

app.get('/v1/models', (_req, res) => {
  const ts = Math.floor(Date.now() / 1000);
  res.json({
    object: 'list',
    data: [...GEMINI_MODELS, ...CHATGPT_MODELS].map(id => ({
      id, object: 'model', created: ts, owned_by: 'web-chat-api',
    })),
  });
});

app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  const body = req.body as ChatRequest;
  const model = body.model ?? DEFAULT_MODEL;
  const messages = body.messages;
  const stream = body.stream ?? false;
  const conversationId = body.conversation_id;
  const enableDeepResearch = body.enable_deep_research ?? false;

  if (!Array.isArray(messages) || messages.length === 0) {
    setCors(res);
    res.status(400).json({ error: { message: 'messages array is required and must not be empty' } });
    return;
  }

  const prompt = formatMessages(messages);
  if (LOG) {
    const extras = [
      conversationId ? `conv:${conversationId}` : '',
      enableDeepResearch ? 'deep-research' : '',
    ].filter(Boolean).join(' ');
    console.log(`[${model}]${extras ? ' '+extras : ''} → ${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}`);
  }

  const id = `chatcmpl-${uuidv4()}`;
  const created = Math.floor(Date.now() / 1000);

  try {
    const backend = pickBackend(model);
    const result = await backend.chat({ prompt, model, conversationId, enableDeepResearch });
    const { text, conversationId: newConvId } = result;

    if (LOG) console.log(`[${model}] ✓ ${text.length} chars${newConvId ? ` conv:${newConvId}` : ''}`);

    setCors(res);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let offset = 0;
      while (offset < text.length) {
        const chunk = text.slice(offset, offset + 80);
        offset += 80;
        const event = {
          id, object: 'chat.completion.chunk', created, model,
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        await new Promise(r => setTimeout(r, 15));
      }
      res.write(`data: ${JSON.stringify({
        id, object: 'chat.completion.chunk', created, model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json({
        id, object: 'chat.completion', created, model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        // Custom extension: pass back conversation_id so client can continue the conversation
        conversation_id: newConvId || undefined,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${model}] ERROR: ${message}`);
    if (stream && res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
      res.end();
    } else {
      setCors(res);
      res.status(500).json({ error: { message, type: 'backend_error' } });
    }
  }
});

app.use((_req, res) => res.status(404).json({ error: { message: 'Not found' } }));

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nWeb Chat API  →  http://localhost:${PORT}/v1`);
  console.log(`GET  /v1/models`);
  console.log(`POST /v1/chat/completions\n`);
  console.log(`Gemini cookies:  ${GEMINI_COOKIES}`);
  console.log(`ChatGPT cookies: ${CHATGPT_COOKIES}`);
  console.log('\nBrowsers start on first request. Ready.\n');
});
