#!/usr/bin/env tsx
// test/smoke.ts — Smoke test: verify basic module imports and MCP server instantiation
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CookieJar } from '../src/cookies.js';
import { GeminiError, GeminiAuthError, GeminiNetworkError } from '../src/errors.js';
import { log } from '../src/logger.js';
import { getRequiredCookieNames, validateCookies } from '../src/cookie-export.js';
let passed = 0;
let failed = 0;
function assert(condition, msg) {
    if (condition) {
        process.stderr.write(`  ✓ ${msg}\n`);
        passed++;
    }
    else {
        process.stderr.write(`  ✗ ${msg}\n`);
        failed++;
    }
}
process.stderr.write('Smoke tests\n');
// logger
log('smoke test log call');
assert(true, 'log() does not throw');
// errors
assert(new GeminiError('x') instanceof Error, 'GeminiError instanceof Error');
assert(new GeminiAuthError('x') instanceof GeminiError, 'GeminiAuthError instanceof GeminiError');
assert(new GeminiNetworkError('x', 503).statusCode === 503, 'GeminiNetworkError.statusCode');
// cookie-export helpers
const names = getRequiredCookieNames();
assert(names.has('SAPISID'), 'getRequiredCookieNames includes SAPISID');
assert(validateCookies(new Set(['SAPISID', 'SID'])), 'validateCookies true for SAPISID+SID');
assert(!validateCookies(new Set(['NID'])), 'validateCookies false for NID only');
// MCP server instantiation
const server = new McpServer({ name: 'gemini-web-mcp', version: '2.0.0' });
assert(!!server, 'McpServer instantiates without error');
// CookieJar throws on missing file
let threw = false;
try {
    CookieJar.fromFile('/no/such/file.json');
}
catch {
    threw = true;
}
assert(threw, 'CookieJar.fromFile throws on missing file');
process.stderr.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0)
    process.exit(1);
//# sourceMappingURL=smoke.js.map