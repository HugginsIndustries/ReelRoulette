#!/usr/bin/env bash
# Best-effort guard, Linux only: ask before any tool call that touches the home
# .config or .local/share folders (real ReelRoulette data, autostart, menu entries)
# or an XDG config/data path. Development happens on Linux; Windows is not covered.
input=$(cat)

ask() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

if ! command -v jq >/dev/null 2>&1; then
  ask "jq is not installed, so the real-data guard cannot inspect this call. Install jq; approve only if this does not touch real ReelRoulette data."
fi

target=$(jq -r '[.tool_input.command, .tool_input.file_path, .tool_input.path, .tool_input.pattern,
                 ((.tool_input.path // "") + "/" + (.tool_input.pattern // ""))]
                | map(select(. != null and . != "" and . != "/")) | join(" ")' <<<"$input")

home='(~|"?\$\{?HOME\}?"?|/home/[^/[:space:]]+)'
pattern="${home}"'/(\.config|\.local/share)([^[:alnum:]_.-]|$)|\$\{?XDG_(CONFIG|DATA)_HOME\}?'

if grep -qE "$pattern" <<<"$target"; then
  ask "This touches the home .config or .local/share folders, or an XDG config or data path. AGENTS.md requires working on a temp copy; approve only if this is intended."
fi
exit 0
