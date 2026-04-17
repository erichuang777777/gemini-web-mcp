.PHONY: help build install install-claude-global install-codex-global test test-watch test-coverage lint lint-fix smoke clean login dev

help:
	@echo "gemini-web-mcp Makefile targets:"
	@echo "  make build              - Compile TypeScript"
	@echo "  make install            - Install dependencies"
	@echo "  make test               - Run tests"
	@echo "  make test-watch         - Run tests in watch mode"
	@echo "  make test-coverage      - Run tests with coverage"
	@echo "  make lint               - Run ESLint"
	@echo "  make lint-fix           - Fix ESLint issues"
	@echo "  make smoke              - Run smoke tests"
	@echo "  make login              - Interactive cookie export"
	@echo "  make dev                - Start dev server with auto-reload"
	@echo "  make clean              - Clean build output"
	@echo "  make install-claude-global   - Install as Claude Desktop MCP"
	@echo "  make install-codex-global    - Install as Codex Desktop MCP"

build:
	npm run build

install:
	npm install
	npx playwright install chromium

test:
	npm run test

test-watch:
	npm run test:watch

test-coverage:
	npm run test:coverage

lint:
	npm run lint

lint-fix:
	npm run lint:fix

smoke:
	npm run smoke

login:
	npm run login

dev:
	npm run dev

clean:
	rm -rf dist/ node_modules/

install-claude-global:
	npm install -g .
	@echo "Installed globally as 'gemini-web-mcp'"

install-codex-global:
	npm install -g .
	@echo "Installed globally as 'gemini-web-mcp'"
