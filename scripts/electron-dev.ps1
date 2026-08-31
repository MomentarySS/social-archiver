$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Stop-ListenPort([int]$Port) {
  $seen = @{}
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $procId = $_.OwningProcess
    if ($procId -and -not $seen[$procId]) {
      $seen[$procId] = $true
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

Stop-ListenPort 5173
Start-Sleep -Milliseconds 400

Write-Host "==> electron:dev (Vite + Electron)"
npm.cmd run electron:dev:inner
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
