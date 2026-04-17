// Shared types for gemini-web-mcp
export type ModelName = 'auto' | 'gemini-2.0-flash' | 'gemini-1.5-pro' | 'gemini-1.5-flash' | 'gemini-1.5-pro-001';

export interface ChatOptions {
  message: string;
  conversationId?: string;
  model?: ModelName;
  enableSearch?: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationResult {
  conversationId: string;
  answerText: string;
}

export interface AuthStatus {
  authenticated: boolean;
  userId: string;
  sessionAgeMs?: number;
}

export interface ConversationInfo {
  conversationId: string;
  title: string;
}

export interface ExportFormat {
  format: 'markdown' | 'json';
}

export interface UploadResult {
  success: boolean;
  message: string;
}

export interface DeepResearchResult {
  success: boolean;
  message: string;
}
