#!/usr/bin/env bash
# SessionStart hook: in a new git worktree, copy the WebUI's node_modules from the main checkout, so npm run
# verify and the mockup's smoke check work there without a network install. The session's folder comes from
# the hook input's cwd, since $CLAUDE_PROJECT_DIR may name the main checkout in a worktree session.
input=$(cat)

webui=src/clients/web/ReelRoulette.WebUI

cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)
root=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null) || exit 0
git_dir=$(git -C "$root" rev-parse --path-format=absolute --git-dir)
common_dir=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)
# The main checkout installs its own packages.
[[ "$git_dir" == "$common_dir" ]] && exit 0

dest="$root/$webui/node_modules"
[[ -e "$dest" ]] && exit 0

main_webui="$(dirname "$common_dir")/$webui"
if [[ -d "$main_webui/node_modules" ]] && cmp -s "$root/$webui/package-lock.json" "$main_webui/package-lock.json" \
  && cp -a --reflink=auto "$main_webui/node_modules" "$dest"; then
  # cp -a keeps the main checkout's install time, older than this checkout's package-lock.json, so
  # run-server.ps1 and verify-web-deploy.ps1 would install again. The lockfiles match, so mark the copy current.
  touch "$dest/.package-lock.json"
  echo "Copied the WebUI's node_modules from the main checkout into this worktree."
  exit 0
fi
echo "This worktree has no $webui/node_modules, and it couldn't be copied from the main checkout because the package-lock.json files differ or the main checkout has none. Ask the user before running npm ci there."
