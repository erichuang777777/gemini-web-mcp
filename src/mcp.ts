import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GeminiBackend, ChatGPTBackend } from './backends.js';
import type { OpenAIMessage } from './types.js';

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

const GEMINI_COOKIES = process.env.GEMINI_COOKIES_PATH ?? '../cookies/gemini-cookies.json';
const CHATGPT_COOKIES = process.env.CHATGPT_COOKIES_PATH ?? '../cookies/chatgpt-cookies.json';

let geminiBackend: GeminiBackend | null = null;
let chatgptBackend: ChatGPTBackend | null = null;

function pickBackend(model: string): GeminiBackend | ChatGPTBackend {
  if (model.startsWith('gemini')) {
    if (!geminiBackend) geminiBackend = new GeminiBackend(GEMINI_COOKIES);
    return geminiBackend;
  }
  if (!chatgptBackend) chatgptBackend = new ChatGPTBackend(CHATGPT_COOKIES);
  return chatgptBackend;
}

const server = new Server(
  { name: 'web-chat-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'chat',
      description:
        'Send messages to Gemini or ChatGPT web UI and get a response. ' +
        'Pass conversation_id from a prior response to continue the same thread. ' +
        'Use enable_deep_research=true for Gemini Deep Research mode.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          model: {
            type: 'string',
            description:
              'Model: gemini-2.0-flash | gemini-2.5-pro | gemini-2.5-flash | ' +
              'gpt-4o | gpt-4o-mini | gpt-4.5 | o1 | o3 | o3-mini',
            default: 'gemini-2.0-flash',
          },
          messages: {
            type: 'array',
            description: 'OpenAI-style messages array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                content: { type: 'string' },
              },
              required: ['role', 'content'],
            },
          },
          conversation_id: {
            type: 'string',
            description: 'Continue an existing conversation (returned in prior response)',
          },
          enable_deep_research: {
            type: 'boolean',
            description: 'Enable Deep Research mode (Gemini only)',
            default: false,
          },
        },
        required: ['messages'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'chat') {
    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${req.params.name}` }],
      isError: true,
    };
  }

  const args = req.params.arguments as {
    model?: string;
    messages: OpenAIMessage[];
    conversation_id?: string;
    enable_deep_research?: boolean;
  };

  const model = args.model ?? 'gemini-2.0-flash';
  const messages = args.messages;
  const conversationId = args.conversation_id;
  const enableDeepResearch = args.enable_deep_research ?? false;

  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'messages must be a non-empty array' }],
      isError: true,
    };
  }

  const prompt = formatMessages(messages);

  try {
    const backend = pickBackend(model);
    const result = await backend.chat({ prompt, model, conversationId, enableDeepResearch });

    const parts = [result.text];
    if (result.conversationId) {
      parts.push(`\n---\nconversation_id: ${result.conversationId}`);
    }

    return { content: [{ type: 'text' as const, text: parts.join('') }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function shutdown() {
  await Promise.allSettled([geminiBackend?.close(), chatgptBackend?.close()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
