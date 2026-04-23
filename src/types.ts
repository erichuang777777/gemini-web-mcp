export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  conversation_id?: string;
  enable_deep_research?: boolean;
  [key: string]: unknown;
}

export interface BackendChatOptions {
  prompt: string;
  model: string;
  conversationId?: string;
  enableDeepResearch?: boolean;
}

export interface ChatResult {
  text: string;
  conversationId?: string;
}

export interface Backend {
  chat(options: BackendChatOptions): Promise<ChatResult>;
  close(): Promise<void>;
}
