#Requires -Version 5.1
<#
.SYNOPSIS
    First-time setup for web-llm-proxy.
#>

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

function Write-Header($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Write-Ok($t)     { Write-Host "[OK]  $t" -ForegroundColor Green }
function Write-Warn($t)   { Write-Host "[!!]  $t" -ForegroundColor Yellow }

Write-Header "Checking Node.js"
try { Write-Ok "Node.js $(node --version)" } catch { Write-Error "Node.js not found -- install from https://nodejs.org"; exit 1 }

Write-Header "Installing dependencies"
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }
Write-Ok "npm packages installed"

Write-Header "Installing Playwright (Chromium)"
npx playwright install chromium --with-deps 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warn "Playwright install may be incomplete -- run: npx playwright install chromium" }
else { Write-Ok "Chromium installed" }

Write-Header "Building TypeScript"
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed -- run 'npm run build' for details"; exit 1 }
Write-Ok "Build succeeded"

Write-Header "Environment config"
$envFile = Join-Path $Root ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $Root ".env.example") $envFile
    Write-Ok ".env created from .env.example"
} else { Write-Ok ".env already exists" }

Write-Header "Cookie export instructions"
$cookiesDir = Join-Path $Root "cookies"
Write-Host ""
Write-Host "  1. Install Cookie-Editor extension (Chrome/Firefox)  https://cookie-editor.com" -ForegroundColor White
Write-Host "  2. Visit https://gemini.google.com (logged in)" -ForegroundColor White
Write-Host "     Export as JSON -> save to: $cookiesDir\gemini-cookies.json" -ForegroundColor Yellow
Write-Host "  3. Visit https://chatgpt.com (logged in)" -ForegroundColor White
Write-Host "     Export as JSON -> save to: $cookiesDir\chatgpt-cookies.json" -ForegroundColor Yellow
Write-Host ""

if (Test-Path (Join-Path $cookiesDir "gemini-cookies.json"))  { Write-Ok "gemini-cookies.json found" }
else { Write-Warn "gemini-cookies.json missing" }
if (Test-Path (Join-Path $cookiesDir "chatgpt-cookies.json")) { Write-Ok "chatgpt-cookies.json found" }
else { Write-Warn "chatgpt-cookies.json missing" }

Write-Header "Ready"
Write-Host ""
Write-Host "  .\start.ps1              Start HTTP API  (http://localhost:8000/v1)" -ForegroundColor Yellow
Write-Host "  npm run mcp              Start MCP server (Claude Desktop)" -ForegroundColor Yellow
Write-Host ""
