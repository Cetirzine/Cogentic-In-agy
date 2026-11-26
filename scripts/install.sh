#!/bin/sh
# Install the Cogentic plugin into Antigravity.
#
# With the Antigravity CLI (`agy`) on PATH: validate, then `agy plugin install`.
# Without it (only the Antigravity desktop app installed), or with --copy: copy the plugin into
# the global plugins folder (~/.gemini/config/plugins/cogentic), which Antigravity discovers and
# loads by itself. Set COGENTIC_PLUGINS_DIR to install somewhere else.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
mode=auto
[ "${1:-}" = "--copy" ] && mode=copy

if [ "$mode" = auto ] && command -v agy >/dev/null 2>&1; then
  agy plugin validate "$here"
  agy plugin install "$here"
  echo "Installed with agy. Restart agy, then type: /cogentic <problem>"
  exit 0
fi

plugins=${COGENTIC_PLUGINS_DIR:-$HOME/.gemini/config/plugins}
target=$plugins/cogentic
mkdir -p "$plugins"

# Never replace a folder that holds some other plugin.
if [ -e "$target" ]; then
  if [ ! -f "$target/plugin.json" ] || ! grep -q '"name": *"cogentic"' "$target/plugin.json"; then
    echo "$target exists and is not the Cogentic plugin; move it away and run this again." >&2
    exit 1
  fi
fi

# Stage next to the target, then swap, so Antigravity never loads a half-copied plugin.
stage=$(mktemp -d "$plugins/.cogentic-install.XXXXXX")
trap 'rm -rf "$stage"' EXIT
for item in plugin.json mcp_config.json agents assets mcp models skills README.md README.en.md; do
  [ -e "$here/$item" ] && cp -R "$here/$item" "$stage/"
done
for f in plugin.json mcp_config.json mcp/cogentic.cjs mcp/engine.cjs skills/cogentic/SKILL.md skills/cogentic-roles/SKILL.md agents/cogentic-worker.md models/catalog.json; do
  [ -f "$stage/$f" ] || { echo "missing $f in $here: is this a complete checkout?" >&2; exit 1; }
done

# Smoke-check the MCP engine with whichever Node runtime is available.
for node in agy-node node; do
  if command -v "$node" >/dev/null 2>&1; then
    "$node" "$stage/mcp/cogentic.cjs" cli cogentic_list_runs '{"workspace":"/nonexistent-cogentic-check"}' >/dev/null
    break
  fi
done

old=""
if [ -e "$target" ]; then
  old="$plugins/.cogentic-old.$$"
  mv "$target" "$old"
fi
mv "$stage" "$target"
trap - EXIT
[ -n "$old" ] && rm -rf "$old"

echo "Copied the plugin to $target."
echo "The Antigravity app picks it up within seconds; restart agy if you use the CLI. Then type: /cogentic <problem>"
