import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('log', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });

  it('writes to stderr with prefix at default log level', async () => {
    const { log } = await import('../src/logger.js');
    log('hello');
    expect(stderrSpy).toHaveBeenCalledWith('[gemini-web-mcp] hello\n');
  });

  it('writes when LOG_LEVEL is debug', async () => {
    process.env.LOG_LEVEL = 'debug';
    const { log } = await import('../src/logger.js');
    log('debug message');
    expect(stderrSpy).toHaveBeenCalledWith('[gemini-web-mcp] debug message\n');
  });

  it('suppresses output when LOG_LEVEL is warn', async () => {
    process.env.LOG_LEVEL = 'warn';
    const { log } = await import('../src/logger.js');
    log('suppressed');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('suppresses output when LOG_LEVEL is error', async () => {
    process.env.LOG_LEVEL = 'error';
    const { log } = await import('../src/logger.js');
    log('suppressed');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
