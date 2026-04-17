// src/tools.ts — MCP tool definitions
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GeminiClient } from './gemini-client.js';
import { GeminiAuthError, GeminiNetworkError } from './errors.js';
import type { ModelName } from './types.js';

function okResponse(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...data }, null, 2) }],
  };
}

function errResponse(error: unknown) {
  let type = 'GeminiError';
  let message = 'Unknown error';
  let hint = '';

  if (error instanceof GeminiAuthError) {
    type = 'AuthError'; message = error.message;
    hint = 'Please re-export cookies from your browser and restart the MCP server.';
  } else if (error instanceof GeminiNetworkError) {
    type = 'NetworkError'; message = error.message;
    hint = 'Please check your network connection or verify gemini.google.com is accessible.';
  } else if (error instanceof Error) {
    message = error.message;
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(
      { success: false, error: { type, message, hint: hint || undefined } }, null, 2
    )}],
  };
}

const MODEL_ENUM = z.enum(['auto', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro-001'] as const);

export function registerTools(server: McpServer, client: GeminiClient): void {

  // ── Tool 1: Authentication Status ──────────────────────────────────────────
  server.tool(
    'gemini_auth_status',
    'Check Gemini cookie authentication status. Verify cookie validity and return login status with user ID.',
    {},
    async () => {
      try {
        const s = await client.checkAuth();
        return okResponse({
          authenticated: s.authenticated,
          userId: s.userId || '(unknown)',
          sessionAgeMs: s.sessionAgeMs,
          message: s.authenticated
            ? `✅ Cookie valid, logged in. User ID: ${s.userId}`
            : '❌ Cookie invalid or expired. Please re-export cookie.',
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 2: Send Message (Enhanced) ───────────────────────────────────────
  server.tool(
    'gemini_chat',
    [
      'Send message to Gemini. Supports:',
      '• New / existing conversation (conversationId)',
      '• Model switching (model)',
      '• Deep Research mode (enableSearch)',
    ].join('\n'),
    {
      message: z.string().min(1, 'Message cannot be empty').max(30_000)
        .describe('Message to send to Gemini'),
      conversationId: z.string().optional()
        .describe('Conversation ID to continue existing conversation'),
      model: MODEL_ENUM.optional()
        .describe('Model: auto, gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash, gemini-1.5-pro-001'),
      enableSearch: z.boolean().optional()
        .describe('Enable Deep Research mode'),
    },
    async ({ message, conversationId, model, enableSearch }) => {
      try {
        const r = await client.chat({
          message,
          conversationId,
          model: model as ModelName | undefined,
          enableSearch,
        });
        return okResponse({
          conversationId: r.conversationId,
          answer: r.answerText,
          continueWith: { conversationId: r.conversationId },
          conversationUrl: r.conversationId
            ? `https://gemini.google.com/app/${r.conversationId}` : undefined,
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 3: New Chat ──────────────────────────────────────────────────────
  server.tool(
    'gemini_new_chat',
    'Create a new Gemini conversation.',
    {},
    async () => {
      try {
        await client.newChat();
        return okResponse({ message: '✅ New conversation created' });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 4: Select Model ──────────────────────────────────────────────────
  server.tool(
    'gemini_select_model',
    'Switch the AI model used by Gemini.',
    {
      model: MODEL_ENUM
        .describe('Target model: auto, gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash, gemini-1.5-pro-001'),
    },
    async ({ model }) => {
      try {
        await client.selectModel(model as ModelName);
        return okResponse({ model, message: `✅ Switched to model: ${model}` });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 5: Get Current Model ─────────────────────────────────────────────
  server.tool(
    'gemini_get_model',
    'Get the currently active AI model in Gemini.',
    {},
    async () => {
      try {
        const model = await client.getModel();
        return okResponse({ model });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 6: Get Conversation ──────────────────────────────────────────────
  server.tool(
    'gemini_get_conversation',
    'Get all messages in current conversation (user and assistant).',
    {},
    async () => {
      try {
        const messages = await client.getConversation();
        return okResponse({
          messages,
          count: messages.length,
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 7: List Conversations ────────────────────────────────────────────
  server.tool(
    'gemini_list_conversations',
    'List all saved conversations in Gemini sidebar.',
    {},
    async () => {
      try {
        const conversations = await client.listConversations();
        return okResponse({
          conversations,
          count: conversations.length,
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 8: Switch Conversation ───────────────────────────────────────────
  server.tool(
    'gemini_switch_conversation',
    'Switch to a specific Gemini conversation.',
    {
      conversationId: z.string().min(1)
        .describe('Conversation ID (from gemini.google.com/app/<id> or list_conversations)'),
    },
    async ({ conversationId }) => {
      try {
        await client.switchConversation(conversationId);
        return okResponse({
          conversationId,
          message: `✅ Switched to conversation: ${conversationId}`,
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 9: Delete Conversation ───────────────────────────────────────────
  server.tool(
    'gemini_delete_conversation',
    'Delete a Gemini conversation.',
    {
      conversationId: z.string().min(1)
        .describe('Conversation ID to delete'),
    },
    async ({ conversationId }) => {
      try {
        await client.deleteConversation(conversationId);
        return okResponse({
          conversationId,
          message: `✅ Conversation deleted: ${conversationId}`,
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 10: Upload File ──────────────────────────────────────────────────
  server.tool(
    'gemini_upload_file',
    'Upload file to Gemini conversation (images, PDFs, etc.).',
    {
      filePath: z.string().min(1)
        .describe('Local file path (absolute path)'),
    },
    async ({ filePath }) => {
      try {
        const result = await client.uploadFile(filePath);
        return okResponse({ ...result });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 11: Enable Deep Research ─────────────────────────────────────────
  server.tool(
    'gemini_enable_deep_research',
    'Enable Gemini Deep Research mode (requires subscription, limited monthly quota).',
    {},
    async () => {
      try {
        const result = await client.enableDeepResearch();
        return result.success
          ? okResponse({ ...result })
          : errResponse(new Error(result.message));
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 12: Export Conversation ──────────────────────────────────────────
  server.tool(
    'gemini_export_conversation',
    'Export current conversation as Markdown or JSON format.',
    {
      format: z.enum(['markdown', 'json']).optional()
        .describe('Export format: markdown (default) or json'),
    },
    async ({ format = 'markdown' }) => {
      try {
        const content = await client.exportConversation(format as 'markdown' | 'json');
        return okResponse({
          format,
          content,
          contentLength: content.length,
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── Tool 13: Regenerate Response ──────────────────────────────────────────
  server.tool(
    'gemini_regenerate',
    'Regenerate Gemini\'s last response.',
    {},
    async () => {
      try {
        const r = await client.regenerate();
        return okResponse({
          conversationId: r.conversationId,
          answer: r.answerText,
          message: '✅ Response regenerated',
        });
      } catch (err) { return errResponse(err); }
    }
  );
}
