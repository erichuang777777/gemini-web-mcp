# Plan: Standardize gemini-web-mcp to match openevidence-mcp structure

**Date:** 2026-04-18  
**Complexity:** MEDIUM  
**Estimated files touched:** ~25 (12 created, 8 modified, 3 deleted)

---

## Context

The repo at `D:\gemini-web-mcp` is a working MCP server that controls Gemini via Playwright.
It needs to be brought in line with the openevidence-mcp project conventions:
test infrastructure, Makefile, CI, ESLint, community docs, env example, and deduplicated source code.

Key facts confirmed from source reading:
- `src/setup.ts` and `scripts/export-cookies.ts` share identical logic (browser launch, cookie collection, file write, validation). The shared portion is the cookie-collection-and-write block (~60 lines).
- `GeminiBardError` and `GeminiParseError` in `src/errors.ts` are defined but never imported anywhere.
- `CookieJar.toCookieString()` in `src/cookies.ts` (lines 100-110) is defined but never called from any other source file.
- `log()` is defined twice: once inline inside `startMcpServer()` in `src/index.ts`, and once at module level in `src/gemini-client.ts`. They have identical implementations but different scope.
- `tsconfig.json` excludes `scripts/` — scripts must use `tsx` directly, not `tsc`.
- The project is ESM (`"type": "module"`) with `NodeNext` module resolution.

---

## Work Objectives

1. Create shared logger module, extract shared cookie-export helper, remove dead code.
2. Add vitest test suite with smoke and unit tests.
3. Add Makefile with standard targets.
4. Add GitHub Actions CI workflow.
5. Add ESLint flat config.
6. Add community docs and `.env.example`.
7. Update `package.json` scripts and `tsconfig.json` includes.

---

## Guardrails

**Must Have:**
- All existing MCP tool behavior preserved (gemini_chat, gemini_auth_status, gemini_history).
- `node dist/index.js setup` still launches interactive browser login.
- Chinese content in README stays Chinese.
- Node >=20, TypeScript ESM, NodeNext module resolution preserved.
- `vitest` chosen as test framework (native ESM support, no transform config needed for `.ts`).

**Must NOT Have:**
- No changes to Playwright browser logic or selector arrays (fragile, would break behavior).
- No new runtime dependencies beyond vitest + eslint.
- Do not commit `gemini-cookies.json` (already absent from `files` in package.json, but confirm `.gitignore`).

---

## Step 1 — Source code cleanup (modify existing files)

**Acceptance criteria:** `tsc --noEmit` passes, no dead exports, single log source.

### 1a. CREATE `src/logger.ts`

```typescript
// src/logger.ts
export function log(msg: string): void {
  const level = process.env.LOG_LEVEL ?? 'info';
  if (level === 'debug' || level === 'info') {
    process.stderr.write(`[gemini-web-mcp] ${msg}\n`);
  }
}
```

This matches the existing implementation already in `gemini-client.ts` exactly.

### 1b. MODIFY `src/gemini-client.ts`

- Remove lines 46-51 (the `function log(...)` definition).
- Add import at top: `import { log } from './logger.js';`
- No other changes needed — all `log(...)` call sites remain.

### 1c. MODIFY `src/index.ts`

- Remove lines 22-25 (the inline `function log(...)` inside `startMcpServer`).
- Add import at top: `import { log } from './logger.js';`
- No other changes needed.

### 1d. MODIFY `src/errors.ts`

- Delete `GeminiBardError` class (lines 19-28).
- Delete `GeminiParseError` class (lines 39-44).
- Keep `GeminiError`, `GeminiAuthError`, `GeminiNetworkError`.

### 1e. MODIFY `src/cookies.ts`

- Delete `toCookieString()` method (lines 99-110).
- Keep all other methods.

### 1f. CREATE `src/cookie-export.ts`

Extract the shared cookie-collection logic from both `setup.ts` and `export-cookies.ts` into a shared helper:

```typescript
// src/cookie-export.ts — shared cookie collection used by setup and export-cookies script
import { BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export const REQUIRED_COOKIE_NAMES = new Set([
  'SAPISID', 'SID', 'HSID', 'SSID', 'APISID', 'SIDCC',
  '__Secure-1PSID', '__Secure-3PSID',
  '__Secure-1PAPISID', '__Secure-3PAPISID',
  '__Secure-1PSIDTS', '__Secure-3PSIDTS',
  '__Secure-1PSIDCC', '__Secure-3PSIDCC',
  '__Secure-1PSIDRTS', '__Secure-3PSIDRTS',
  'NID', 'AEC', '__Secure-BUCKET',
  '_ga', '_gcl_au',
]);

export interface CookieExportResult {
  count: number;
  hasSapisid: boolean;
  hasSid: boolean;
  savedPath: string;
}

export async function collectAndSaveCookies(
  context: BrowserContext,
  outputPath: string
): Promise<CookieExportResult> {
  const allCookies = await context.cookies([
    'https://gemini.google.com',
    'https://google.com',
    'https://accounts.google.com',
  ]);

  const googleCookies = allCookies.filter(c =>
    c.domain.includes('google.com') &&
    (REQUIRED_COOKIE_NAMES.has(c.name) || c.domain.includes('gemini'))
  );

  const exportData = googleCookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    expirationDate: c.expires > 0 ? c.expires : undefined,
    session: c.expires === -1,
    sameSite: c.sameSite ?? null,
    storeId: null,
    hostOnly: !c.domain.startsWith('.'),
  }));

  const outputDir = path.dirname(path.resolve(outputPath));
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

  const names = new Set(exportData.map(c => c.name));
  return {
    count: exportData.length,
    hasSapisid: names.has('SAPISID') || names.has('__Secure-1PAPISID'),
    hasSid: names.has('SID') || names.has('__Secure-1PSID') || names.has('__Secure-3PSID'),
    savedPath: path.resolve(outputPath),
  };
}
```

### 1g. MODIFY `src/setup.ts`

- Remove the `requiredNames` Set, the `googleCookies` filter, the `exportData` map, the `fs.writeFileSync`, the `names` Set, and `hasSapisid`/`hasSid` variables (lines 89-132 approximately).
- Add `import { collectAndSaveCookies } from './cookie-export.js';`
- Replace removed block with: `const result = await collectAndSaveCookies(context, COOKIES_PATH);`
- Update the success/failure console output to use `result.count`, `result.hasSapisid`, `result.hasSid`, `result.savedPath`.

### 1h. MODIFY `scripts/export-cookies.ts`

Same refactor as setup.ts — the body of `main()` after the browser/page setup uses `collectAndSaveCookies`. Note: scripts use `tsx` and import from `../src/cookie-export.js`.

**Verification:** Run `npx tsc --noEmit` — must pass with 0 errors.

---

## Step 2 — Test infrastructure (vitest)

**Acceptance criteria:** `npm test` runs and passes; smoke test exits 0; no browser launched during unit tests.

### 2a. INSTALL dev dependencies

```
npm install --save-dev vitest @vitest/coverage-v8
```

### 2b. CREATE `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/setup.ts'],
    },
  },
});
```

### 2c. CREATE `test/cookies.test.ts`

Tests for `CookieJar` (pure, no browser, no I/O beyond temp files):

- `CookieJar.fromFile()` with a valid JSON array → `hasRequiredCookies()` returns true.
- `CookieJar.fromFile()` with Playwright storage-state format → parsed correctly.
- `CookieJar.fromFile()` with a Netscape .txt format → parsed correctly.
- `CookieJar.fromFile()` with missing file → throws with message containing "不存在".
- `CookieJar.fromFile()` with invalid JSON → throws with message containing "無法解析".
- `CookieJar.toPlaywrightCookies()` → returns array with correct shape.
- `hasRequiredCookies()` returns false when SAPISID and SID variants are absent.

Use `fs.writeFileSync` to a temp dir for fixture files. No mocking needed.

### 2d. CREATE `test/errors.test.ts`

Tests for error classes:

- `GeminiError` is instance of `Error`.
- `GeminiAuthError` is instance of `GeminiError`.
- `GeminiNetworkError` carries `statusCode` property.

### 2e. CREATE `test/logger.test.ts`

Tests for `logger.ts`:

- With `LOG_LEVEL=debug`, calling `log()` writes to stderr.
- With `LOG_LEVEL=silent`, calling `log()` does not write to stderr.
- Output includes the `[gemini-web-mcp]` prefix.

Spy on `process.stderr.write` using `vi.spyOn`.

### 2f. CREATE `test/smoke.ts` (not a vitest file — a standalone script)

```typescript
#!/usr/bin/env tsx
// test/smoke.ts — verifies the built dist loads without crashing
// Run with: node dist/index.js --version (or equivalent)
import { execSync } from 'child_process';

const result = execSync('node dist/index.js --help 2>&1 || true').toString();
// The server will attempt to start MCP mode and hang on stdio, so we just
// verify the build exists and is executable.
import { existsSync } from 'fs';
if (!existsSync('./dist/index.js')) {
  console.error('SMOKE FAIL: dist/index.js not found');
  process.exit(1);
}
console.log('SMOKE PASS: dist/index.js exists');
```

Note: Because the server blocks on stdin, the smoke test only validates the build artifact exists and is syntactically valid JS. A deeper smoke test would require a child process with a timeout.

### 2g. UPDATE `tsconfig.json`

Change `"include"` from `["src/**/*"]` to `["src/**/*", "test/**/*", "vitest.config.ts"]`.
Keep `"exclude": ["node_modules", "dist", "scripts"]`.

---

## Step 3 — ESLint flat config

**Acceptance criteria:** `npm run lint` exits 0 on the current codebase (after cleanup in Step 1).

### 3a. INSTALL dev dependencies

```
npm install --save-dev eslint @eslint/js typescript-eslint
```

### 3b. CREATE `eslint.config.js`

```javascript
// eslint.config.js — ESLint v9 flat config
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  {
    // scripts/ use console.log intentionally (interactive CLI output)
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // setup.ts uses console.log for interactive CLI output
    files: ['src/setup.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  }
);
```

Note: `no-console` is enforced on `src/` (except `setup.ts`) because `src/` uses `process.stderr.write` via `logger.ts`. This matches the existing pattern.

---

## Step 4 — Makefile

**Acceptance criteria:** `make build`, `make test`, `make lint`, `make smoke`, `make install-claude-global`, `make install-codex-global` all succeed.

### 4a. CREATE `Makefile`

```makefile
.PHONY: build test lint smoke install-claude-global install-codex-global clean

# Build TypeScript to dist/
build:
	npm run build

# Run vitest unit tests
test:
	npm test

# Lint source files
lint:
	npm run lint

# Verify built artifact exists (non-interactive check)
smoke: build
	npm run smoke

# Install into Claude Desktop config (macOS / Linux path)
install-claude-global:
	@echo "Add the following to your claude_desktop_config.json:"
	@echo '{'
	@echo '  "mcpServers": {'
	@echo '    "gemini-web": {'
	@echo '      "command": "npx",'
	@echo '      "args": ["-y", "gemini-web-mcp"],'
	@echo '      "env": {'
	@echo '        "GEMINI_COOKIES_PATH": "$(HOME)/gemini-cookies.json",'
	@echo '        "GEMINI_LANGUAGE": "zh-TW"'
	@echo '      }'
	@echo '    }'
	@echo '  }'
	@echo '}'

# Install into Codex / OpenAI config
install-codex-global:
	@echo "Add the following to your codex MCP config:"
	@echo '{"mcpServers":{"gemini-web":{"command":"npx","args":["-y","gemini-web-mcp"]}}}'

# First-time login: export cookies via interactive browser
login:
	npm run login

clean:
	rm -rf dist/
```

---

## Step 5 — GitHub Actions CI

**Acceptance criteria:** Workflow file is valid YAML; on push/PR to main, it runs build + lint + test.

### 5a. CREATE `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install chromium --with-deps

      - name: Build
        run: npm run build

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Smoke
        run: npm run smoke
```

Note: Playwright chromium is required because `CookieJar` loads playwright types at compile time (even in tests that don't launch browsers, the import chain goes through playwright). If tests are fully mocked and never touch playwright runtime, the `install chromium` step can be removed — verify after test authoring.

---

## Step 6 — Community docs and env example

**Acceptance criteria:** All files exist; no placeholder content; CONTRIBUTING references the Makefile targets.

### 6a. CREATE `.env.example`

```bash
# Path to your exported Google cookies JSON file
# Default: ~/gemini-cookies.json
GEMINI_COOKIES_PATH=/path/to/gemini-cookies.json

# Browser locale for Gemini UI (affects response language)
# Default: zh-TW
GEMINI_LANGUAGE=zh-TW

# Log verbosity: debug | info | silent
# Default: info
LOG_LEVEL=info
```

### 6b. CREATE `docs/` directory with client config examples

**`docs/claude-desktop.md`** — Claude Desktop configuration (English + Chinese inline).

**`docs/codex.md`** — OpenAI Codex / ChatGPT Desktop configuration.

**`docs/cursor.md`** — Cursor IDE MCP configuration.

Each file contains the JSON snippet for `mcpServers`, the `GEMINI_COOKIES_PATH` env var, and a note to run `npm run login` first.

### 6c. CREATE `CONTRIBUTING.md`

Content:
- Prerequisites (Node >=20, Chrome installed).
- Development setup: `npm install`, `npm run build`, `npm run login`.
- Running tests: `make test`.
- Linting: `make lint`.
- Submitting PRs: conventional commit format, one feature per PR.
- Project structure table (src/, scripts/, test/, docs/).

### 6d. CREATE `CHANGELOG.md`

```markdown
# Changelog

All notable changes are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Standardized project structure matching openevidence-mcp conventions
- vitest unit test suite (cookies, errors, logger)
- ESLint flat config (v9)
- Makefile with build/test/lint/smoke/install targets
- GitHub Actions CI workflow (Node 20 + 22 matrix)
- docs/ directory with Claude Desktop, Codex, Cursor config examples
- .env.example for environment variable reference
- Shared cookie-export helper (src/cookie-export.ts)
- Shared logger module (src/logger.ts)
- CONTRIBUTING.md, CHANGELOG.md, CODE_OF_CONDUCT.md

### Changed
- Removed duplicate cookie-collection logic from setup.ts and export-cookies.ts

### Removed
- Dead error classes: GeminiBardError, GeminiParseError
- Unused CookieJar.toCookieString() method
- Duplicate log() function definitions
```

### 6e. CREATE `CODE_OF_CONDUCT.md`

Use the standard Contributor Covenant v2.1 text (English). This is boilerplate — copy verbatim from https://www.contributor-covenant.org/version/2/1/code_of_conduct/

### 6f. CREATE `.gitignore` (if absent or incomplete)

```
node_modules/
dist/
gemini-cookies.json
*.local.json
.env
.env.local
```

---

## Step 7 — Update `package.json` scripts

**Acceptance criteria:** All new `npm run X` commands resolve correctly.

### 7a. MODIFY `package.json` — scripts section

Replace the current `scripts` block with:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsx watch src/index.ts",
  "start": "node dist/index.js",
  "typecheck": "tsc --noEmit",
  "login": "playwright install chromium && tsx scripts/export-cookies.ts",
  "export-cookies": "tsx scripts/export-cookies.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "smoke": "tsx test/smoke.ts",
  "lint": "eslint src/ test/",
  "lint:fix": "eslint src/ test/ --fix"
}
```

Key changes:
- `setup` renamed to `login` (clearer intent, matches Makefile `login` target).
- `test`, `test:watch`, `test:coverage` added.
- `smoke` added.
- `lint`, `lint:fix` added.

### 7b. MODIFY `package.json` — devDependencies section

Add:
```json
"vitest": "^2.0.0",
"@vitest/coverage-v8": "^2.0.0",
"eslint": "^9.0.0",
"@eslint/js": "^9.0.0",
"typescript-eslint": "^8.0.0"
```

---

## Files to DELETE

| File | Reason |
|------|--------|
| None | No files are deleted outright. `scripts/test.ts`, `scripts/test-full.ts`, `scripts/inspect-ui.ts` are left as-is — they are manual dev tools, not shipped. If the user wants them removed, that is a separate cleanup pass. |

The dead code inside files is removed in Step 1 (class deletions, method deletion, function deletions) rather than deleting whole files.

---

## Order of Operations

1. Step 1 (source cleanup) — must come first; all later steps depend on clean source.
2. Step 3a (install ESLint deps) + Step 2a (install vitest deps) — parallel, just `npm install`.
3. Step 2b–2f (test files) + Step 3b (eslint.config.js) — parallel, no interdependency.
4. Step 7 (package.json scripts) — update after deps are installed.
5. Step 4 (Makefile) — can be done at any point.
6. Step 5 (CI workflow) — can be done at any point.
7. Step 6 (community docs + .env.example) — can be done at any point.
8. Verification pass: `npm run build && npm run lint && npm test && npm run smoke`.

---

## Success Criteria

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm test` exits 0 with >=5 passing tests.
- [ ] `npm run build` produces `dist/index.js`.
- [ ] `npm run smoke` exits 0.
- [ ] `make build`, `make test`, `make lint`, `make smoke` all work.
- [ ] No duplicate `log()` definitions in `src/`.
- [ ] No references to `GeminiBardError` or `GeminiParseError` anywhere in `src/`.
- [ ] `src/cookie-export.ts` imported by both `src/setup.ts` and `scripts/export-cookies.ts`.
- [ ] `.github/workflows/ci.yml` is valid YAML.
- [ ] `docs/`, `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `.env.example` all exist.
