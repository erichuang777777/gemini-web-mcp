// src/tools.ts — MCP 工具定義
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GeminiClient, GeminiModel } from './gemini-client.js';
import { GeminiAuthError, GeminiNetworkError } from './errors.js';

function okResponse(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...data }, null, 2) }],
  };
}

function errResponse(error: unknown) {
  let type = 'GeminiError';
  let message = '未知錯誤';
  let hint = '';

  if (error instanceof GeminiAuthError) {
    type = 'AuthError'; message = error.message;
    hint = '請重新從瀏覽器匯出 Cookie，並重啟 MCP Server。';
  } else if (error instanceof GeminiNetworkError) {
    type = 'NetworkError'; message = error.message;
    hint = '請檢查網路連線，或確認 gemini.google.com 可正常訪問。';
  } else if (error instanceof Error) {
    message = error.message;
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(
      { success: false, error: { type, message, hint: hint || undefined } }, null, 2
    )}],
  };
}

export function registerTools(server: McpServer, client: GeminiClient): void {

  // ── 工具 1：認證狀態 ──────────────────────────────────────────────────────
  server.tool(
    'gemini_auth_status',
    '檢查 Gemini Cookie 認證狀態。驗證 Cookie 是否有效，回傳登入狀態與用戶 ID。',
    {},
    async () => {
      try {
        const s = await client.checkAuth();
        return okResponse({
          authenticated: s.authenticated,
          userId: s.userId || '（未知）',
          sessionAgeMs: s.sessionAgeMs,
          message: s.authenticated
            ? `✅ Cookie 有效，已登入。用戶 ID: ${s.userId}`
            : '❌ Cookie 無效或已過期。請重新匯出 Cookie。',
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── 工具 2：發送訊息 ──────────────────────────────────────────────────────
  server.tool(
    'gemini_chat',
    [
      '向 Gemini 發送訊息。支援：',
      '• 新建對話 / 繼續對話（conversationId）',
      '• 切換模型（model: 2.5-pro / 2.5-flash / 2.0-flash / 2.0-flash-thinking）',
      '• 啟用 Deep Research（deepResearch: true，回覆時間較長）',
    ].join('\n'),
    {
      message: z.string().min(1, '訊息不能為空').max(30_000)
        .describe('要發送給 Gemini 的訊息'),
      conversationId: z.string().regex(/^[0-9a-f]{16}$/i).optional()
        .describe('繼續對話時填入（16 位十六進制，例如 10755c8c7a9383b4）'),
      model: z.enum(['default', '2.5-pro', '2.5-flash', '2.0-flash', '2.0-flash-thinking']).optional()
        .describe('指定模型（不填則沿用目前選擇）：2.5-pro | 2.5-flash | 2.0-flash | 2.0-flash-thinking'),
      deepResearch: z.boolean().optional()
        .describe('啟用 Deep Research 模式（適合需要深度網路搜尋的問題，等待時間較長）'),
    },
    async ({ message, conversationId, model, deepResearch }) => {
      try {
        const r = await client.chat({
          message,
          conversationId,
          model: model as GeminiModel | undefined,
          deepResearch,
        });
        return okResponse({
          conversationId: r.conversationId,
          answer: r.answerText,
          model: r.model ?? 'default',
          deepResearch: r.deepResearch ?? false,
          continueWith: { conversationId: r.conversationId },
          conversationUrl: r.conversationId
            ? `https://gemini.google.com/app/${r.conversationId}` : undefined,
        });
      } catch (err) { return errResponse(err); }
    }
  );

  // ── 工具 3：對話歷史 ──────────────────────────────────────────────────────
  server.tool(
    'gemini_history',
    '獲取指定 Gemini 對話的歷史訊息。',
    {
      conversationId: z.string().regex(/^[0-9a-f]{16}$/i)
        .describe('對話 ID（16 位十六進制，例如 10755c8c7a9383b4）'),
    },
    async ({ conversationId }) => {
      try {
        const msgs = await client.getHistory(conversationId);
        return okResponse({
          conversationId,
          messageCount: msgs.length,
          messages: msgs.map((m, i) => ({
            index: i + 1,
            role: m.role,
            text: m.text.length > 500 ? m.text.slice(0, 500) + '…' : m.text,
            messageId: m.messageId,
          })),
        });
      } catch (err) { return errResponse(err); }
    }
  );
}
