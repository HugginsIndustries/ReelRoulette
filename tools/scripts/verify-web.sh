#!/usr/bin/env bash
set -euo pipefail

SKIP_INSTALL=false
if [[ "${1:-}" == "--skip-install" ]]; then
  SKIP_INSTALL=true
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in PATH." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_PROJECT_DIR="${SCRIPT_DIR}/../../src/clients/web/ReelRoulette.WebUI"

pushd "${WEB_PROJECT_DIR}" >/dev/null
if [[ "${SKIP_INSTALL}" != "true" ]]; then
  npm install
fi

npm run verify
popd >/dev/null
