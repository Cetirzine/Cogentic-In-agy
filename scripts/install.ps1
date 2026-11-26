# Install the Cogentic plugin into Antigravity.
#
# With the Antigravity CLI (agy) on PATH: validate, then `agy plugin install`.
# Without it (only the Antigravity desktop app installed), or with -Copy: copy the plugin into the
# global plugins folder (%USERPROFILE%\.gemini\config\plugins\cogentic), which Antigravity
# discovers and loads by itself. Set COGENTIC_PLUGINS_DIR to install somewhere else.
param([switch]$Copy)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSScriptRoot

if (-not $Copy -and (Get-Command agy -ErrorAction SilentlyContinue)) {
  agy plugin validate $here
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  agy plugin install $here
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host 'Installed with agy. Restart agy, then type: /cogentic <problem>'
  exit 0
}

$plugins = if ($env:COGENTIC_PLUGINS_DIR) { $env:COGENTIC_PLUGINS_DIR } else { Join-Path $HOME '.gemini\config\plugins' }
$target = Join-Path $plugins 'cogentic'
New-Item -ItemType Directory -Force -Path $plugins | Out-Null

# Never replace a folder that holds some other plugin.
if (Test-Path $target) {
  $manifest = Join-Path $target 'plugin.json'
  if (-not (Test-Path $manifest) -or -not (Select-String -Path $manifest -Pattern '"name":\s*"cogentic"' -Quiet)) {
    Write-Error "$target exists and is not the Cogentic plugin; move it away and run this again."
  }
}

# Stage next to the target, then swap, so Antigravity never loads a half-copied plugin.
$stage = Join-Path $plugins (".cogentic-install." + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  foreach ($item in 'plugin.json', 'mcp_config.json', 'agents', 'assets', 'mcp', 'models', 'skills', 'README.md', 'README.en.md') {
    $src = Join-Path $here $item
    if (Test-Path $src) { Copy-Item -Recurse -Force $src $stage }
  }
  foreach ($f in 'plugin.json', 'mcp_config.json', 'mcp\cogentic.cjs', 'mcp\engine.cjs', 'skills\cogentic\SKILL.md', 'skills\cogentic-roles\SKILL.md', 'agents\cogentic-worker.md', 'models\catalog.json') {
    if (-not (Test-Path (Join-Path $stage $f))) { throw "missing $f in ${here}: is this a complete checkout?" }
  }
  foreach ($node in 'agy-node', 'node') {
    if (Get-Command $node -ErrorAction SilentlyContinue) {
      & $node (Join-Path $stage 'mcp\cogentic.cjs') cli cogentic_list_runs '{"workspace":"C:\\nonexistent-cogentic-check"}' | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'the Cogentic MCP engine failed its self-check' }
      break
    }
  }
  if (Test-Path $target) {
    $old = Join-Path $plugins (".cogentic-old." + [guid]::NewGuid().ToString('N'))
    Move-Item $target $old
    Move-Item $stage $target
    Remove-Item -Recurse -Force $old
  } else {
    Move-Item $stage $target
  }
} finally {
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
}

Write-Host "Copied the plugin to $target."
Write-Host 'The Antigravity app picks it up within seconds; restart agy if you use the CLI. Then type: /cogentic <problem>'
