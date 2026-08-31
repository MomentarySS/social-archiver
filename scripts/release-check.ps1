$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> npm test"
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> npm run build"
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "release:check OK"
