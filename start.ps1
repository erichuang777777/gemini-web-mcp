#Requires -Version 5.1
<#
.SYNOPSIS
    Start the web-llm-proxy API server.
#>

$Root = $PSScriptRoot

foreach ($f in @("cookies/gemini-cookies.json", "cookies/chatgpt-cookies.json")) {
    if (-not (Test-Path (Join-Path $Root $f))) {
        Write-Host "[WARN] Missing: $f  (run .\setup.ps1 for instructions)" -ForegroundColor Yellow
    }
}

if (-not (Test-Path (Join-Path $Root "dist/server.js"))) {
    Write-Host "[INFO] Building..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host ""
Write-Host "web-llm-proxy  ->  http://localhost:8000/v1  (Ctrl+C to stop)" -ForegroundColor Cyan
Write-Host ""

node (Join-Path $Root "dist/server.js")
