$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

& (Join-Path $PSScriptRoot "release-check.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "==> npm run electron:build"
npm.cmd run electron:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$version = node (Join-Path $PSScriptRoot "print-version.mjs")
Write-Host ""
Write-Host "release:pack OK"
Write-Host "产物: dist-electron\SocialArchiver-$version-win.zip"
Write-Host "      dist-electron\SocialArchiver-$version-win.exe"
