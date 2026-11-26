#!/bin/sh
# Check every tool name in the plugin's agents/*.md against the agy tool registry.
#
# An unknown name breaks the agent at start-up ("tool ... not found in registry"). agy resolves an
# agent's components before it calls any model, so this needs the agy CLI but no quota: it runs
# each name in a throwaway workspace agent and reads the first error. Run it after editing an
# agent's tools, or after upgrading Antigravity.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
command -v agy >/dev/null 2>&1 || { echo "needs the agy CLI on PATH" >&2; exit 2; }

ws=$(mktemp -d)
trap 'rm -rf "$ws"' EXIT
mkdir -p "$ws/.agents/agents"
(cd "$ws" && git init -q . 2>/dev/null || true)

probe() {  # probe <tool>: prints "ok" if the registry resolves it
  n="cogentic-probe-$(printf %s "$1" | tr '_' '-')"
  printf -- '---\nname: %s\ndescription: "Registry probe for one tool name; not for use."\ntools:\n  - %s\nmainAgent: true\nsubagent: true\n---\n\n# Probe\n\nReply OK.\n' "$n" "$1" > "$ws/.agents/agents/$n.md"
  out=$(cd "$ws" && agy --agent "$n" -p OK --print-timeout 60s 2>&1 | head -1 || true)
  rm -f "$ws/.agents/agents/$n.md"
  case "$out" in
    *"not found in registry"*) echo "missing" ;;
    *"failed to resolve"*|*"unknown component"*) echo "error: $out" ;;
    *) echo "ok" ;;
  esac
}

status=0
for agent in "$here"/agents/*.md; do
  tools=$(awk '/^---/{f++; next} f==1 && /^tools:/{t=1; next} f==1 && t && /^  - /{sub(/^  - /,""); print; next} f==1 && t{t=0}' "$agent")
  for t in $tools; do
    r=$(probe "$t")
    printf '%-40s %-28s %s\n' "$(basename "$agent")" "$t" "$r"
    [ "$r" = ok ] || status=1
  done
done
exit $status
