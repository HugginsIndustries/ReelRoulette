#!/usr/bin/env bash
# Best-effort guard: ask before any Bash command that runs git commit or git push,
# including global options before the subcommand (git -C <path> commit), commands
# chained after && or ;, and git commit --amend. The reason names the branch of the
# session's folder, from the hook input's cwd, so a commit to main stands out.
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
  cwd=$(jq -r '.cwd // empty' <<<"$input")
  branch=$(git -C "${cwd:-.}" branch --show-current 2>/dev/null)
  # A commit on this session's own claude/ branch goes through. A push, a commit on main, and a
  # commit that names another folder (git -C, --git-dir, --work-tree, or a cd first) still ask.
  push="(^|[[:space:];&|(\`/\"'])git([[:space:]]+(${option}))*[[:space:]]+push([[:space:];&|)\`\"']|$)"
  if [[ $branch == claude/* ]] && ! grep -qE "$push" <<<"$command" \
    && ! grep -qE '(^|[[:space:];&|(])(cd|pushd)[[:space:]]|(^|[[:space:]])(-C|--git-dir|--work-tree)([[:space:]=]|$)' <<<"$command"; then
    exit 0
  fi
  ask "This runs git commit or git push, and this session's folder is on branch ${branch:-(none)}. Approve only if the user or the advisor said this work is ready: workers commit only on their own claude/ branch, only the advisor's squash merge commits to main, and agents never push."
fi
exit 0
