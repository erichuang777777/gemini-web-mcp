import { describe, it, expect } from 'vitest';
import { GeminiError, GeminiAuthError, GeminiNetworkError } from '../src/errors.js';

describe('GeminiError', () => {
  it('sets message and name', () => {
    const err = new GeminiError('base error');
    expect(err.message).toBe('base error');
    expect(err.name).toBe('GeminiError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('GeminiAuthError', () => {
  it('sets message and name', () => {
    const err = new GeminiAuthError('auth failed');
    expect(err.message).toBe('auth failed');
    expect(err.name).toBe('GeminiAuthError');
    expect(err).toBeInstanceOf(GeminiError);
  });
});

describe('GeminiNetworkError', () => {
  it('sets message and name without statusCode', () => {
    const err = new GeminiNetworkError('network error');
    expect(err.message).toBe('network error');
    expect(err.name).toBe('GeminiNetworkError');
    expect(err.statusCode).toBeUndefined();
    expect(err).toBeInstanceOf(GeminiError);
  });

  it('sets statusCode when provided', () => {
    const err = new GeminiNetworkError('not found', 404);
    expect(err.statusCode).toBe(404);
  });
});
