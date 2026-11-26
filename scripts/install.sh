#!/bin/sh
# Validate and install the Cogentic plugin into Antigravity CLI.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
command -v agy >/dev/null 2>&1 || { echo "agy (Antigravity CLI) is not on PATH: https://antigravity.google/docs/cli" >&2; exit 1; }
agy plugin validate "$here"
agy plugin install "$here"
echo "Installed. Restart agy, then type: /cogentic <problem>"
