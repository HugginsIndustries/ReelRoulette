#!/usr/bin/env bash
# Best-effort guard: ask before any Bash command that runs git commit or git push,
# including global options before the subcommand (git -C <path> commit), commands
# chained after && or ;, and git commit --amend. Agents do not commit or push.
input=$(cat)

ask() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

if ! command -v jq >/dev/null 2>&1; then
  ask "jq is not installed, so the git commit guard cannot inspect this call. Install jq; approve only if this does not run git commit or git push."
fi

# Join backslash-continued lines so options split across lines still match.
command=$(jq -r '.tool_input.command // "" | gsub("\\\\\n"; " ")' <<<"$input")

word='([^[:space:];&|()"'"'"']|"[^"]*"|'"'"'[^'"'"']*'"'"')+'
option="(-C|-c|--git-dir|--work-tree|--namespace)[[:space:]]+${word}|-${word}"
pattern="(^|[[:space:];&|(\`/\"'])git([[:space:]]+(${option}))*[[:space:]]+(commit|push)([[:space:];&|)\`\"']|$)"

if grep -qE "$pattern" <<<"$command"; then
  ask "This runs git commit or git push. AGENTS.md says agents do not commit or push; approve only if you asked for this."
fi
exit 0
