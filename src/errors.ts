// src/errors.ts

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

/** Cookie 無效或 Session 已過期 */
export class GeminiAuthError extends GeminiError {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiAuthError';
  }
}

/** 網路問題、HTTP 錯誤 */
export class GeminiNetworkError extends GeminiError {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'GeminiNetworkError';
  }
}
