// src/logger.ts — Shared logging module
export function log(msg: string): void {
  const level = process.env.LOG_LEVEL ?? 'info';
  if (level === 'debug' || level === 'info') {
    process.stderr.write(`[gemini-web-mcp] ${msg}\n`);
  }
}
