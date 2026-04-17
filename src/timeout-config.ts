// Model-aware timeout configuration for Gemini API calls
export const MODEL_TIMEOUTS: Record<string, number> = {
  'gemini-2.0-flash': 120_000,    // 2 minutes
  'gemini-1.5-pro': 180_000,      // 3 minutes
  'gemini-1.5-flash': 90_000,     // 1.5 minutes
  'gemini-1.5-pro-001': 180_000,  // 3 minutes
  'default': 120_000,              // 2 minutes
};

export function getTimeoutForModel(model?: string): number {
  if (!model) return MODEL_TIMEOUTS['default'];
  return MODEL_TIMEOUTS[model] ?? MODEL_TIMEOUTS['default'];
}
