# Validate and install the Cogentic plugin into Antigravity CLI.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command agy -ErrorAction SilentlyContinue)) {
  Write-Error 'agy (Antigravity CLI) is not on PATH: https://antigravity.google/docs/cli'
}
agy plugin validate $here
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
agy plugin install $here
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Installed. Restart agy, then type: /cogentic <problem>'
