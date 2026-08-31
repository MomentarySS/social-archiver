$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$electronExe = Join-Path $PSScriptRoot "..\node_modules\electron\dist\electron.exe" | Resolve-Path -ErrorAction SilentlyContinue
if (-not $electronExe) {
  Write-Error "缺少 node_modules\electron\dist\electron.exe，请先执行 npm install"
}

# 复用 node_modules/electron/dist（package.json build.electronDist）；
# 若仍要拉 NSIS 等工具，走国内镜像，避免 GitHub 超时。
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

Write-Host "==> electron-builder --win (local electron + npmmirror fallback)"
npx.cmd electron-builder --win
exit $LASTEXITCODE
