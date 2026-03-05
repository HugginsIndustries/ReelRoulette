#!/usr/bin/env bash
set -euo pipefail

VERSION_ID="${1:-}"
DEPLOY_ROOT="${2:-}"
SKIP_INSTALL="${SKIP_INSTALL:-false}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in PATH." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/../.."
WEB_PROJECT_DIR="${REPO_ROOT}/src/clients/web/ReelRoulette.WebUI"

if [[ -z "${DEPLOY_ROOT}" ]]; then
  DEPLOY_ROOT="${REPO_ROOT}/.web-deploy"
fi

if [[ -z "${VERSION_ID}" ]]; then
  VERSION_ID="$(date -u +%Y%m%d%H%M%S)"
fi

VERSION_DIR="${DEPLOY_ROOT}/versions/${VERSION_ID}"
if [[ -d "${VERSION_DIR}" ]]; then
  echo "Version '${VERSION_ID}' already exists at '${VERSION_DIR}'." >&2
  exit 1
fi

mkdir -p "${DEPLOY_ROOT}/versions"

pushd "${WEB_PROJECT_DIR}" >/dev/null
if [[ "${SKIP_INSTALL}" != "true" ]]; then
  npm install
fi
npm run build
mkdir -p "${VERSION_DIR}"
cp -R dist/. "${VERSION_DIR}/"
popd >/dev/null

cat > "${VERSION_DIR}/version-info.json" <<EOF
{"versionId":"${VERSION_ID}","publishedUtc":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

echo "Published web version '${VERSION_ID}' to '${VERSION_DIR}'."
