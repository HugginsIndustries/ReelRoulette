#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_PROJECT_DIR="${REPO_ROOT}/src/clients/web/ReelRoulette.WebUI"
DIST_PATH="${WEB_PROJECT_DIR}/dist"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "dotnet SDK not found in PATH." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH." >&2
  exit 1
fi

echo "Building WebUI for ServerApp static serving..."
pushd "${WEB_PROJECT_DIR}" >/dev/null
npm run build
popd >/dev/null

if [[ ! -d "${DIST_PATH}" ]]; then
  echo "WebUI build output was not found at ${DIST_PATH}." >&2
  exit 1
fi

export ServerApp__WebUiStaticRootPath="${DIST_PATH}"
"${REPO_ROOT}/tools/scripts/run-server.sh"
