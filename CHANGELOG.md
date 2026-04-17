# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-04-18

### Added
- Standardized repository structure matching openevidence-mcp
- Vitest test framework and test suite
- ESLint configuration
- Makefile for common tasks
- GitHub Actions CI/CD workflow
- Comprehensive documentation (CONTRIBUTING, CODE_OF_CONDUCT)

### Changed
- Refactored logger into shared module (src/logger.ts)
- Extracted cookie export logic into reusable helper (src/cookie-export.ts)
- Updated TypeScript configuration to include test files

### Removed
- Unused error classes (GeminiBardError, GeminiParseError)
- Unused CookieJar.toCookieString() method
- Duplicate cookie export code across setup.ts and scripts/export-cookies.ts
