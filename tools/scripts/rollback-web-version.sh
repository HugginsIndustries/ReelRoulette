#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${1:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/../.."
if [[ -z "${DEPLOY_ROOT}" ]]; then
  DEPLOY_ROOT="${REPO_ROOT}/.web-deploy"
fi

MANIFEST_PATH="${DEPLOY_ROOT}/active-manifest.json"
if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "Active manifest does not exist at '${MANIFEST_PATH}'." >&2
  exit 1
fi

ACTIVE_VERSION="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(m.activeVersion||'');" "${MANIFEST_PATH}")"
PREVIOUS_VERSION="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(m.previousVersion||'');" "${MANIFEST_PATH}")"

if [[ -z "${PREVIOUS_VERSION}" ]]; then
  echo "No previousVersion is available for rollback." >&2
  exit 1
fi

ROLLBACK_DIR="${DEPLOY_ROOT}/versions/${PREVIOUS_VERSION}"
if [[ ! -d "${ROLLBACK_DIR}" ]]; then
  echo "Rollback version '${PREVIOUS_VERSION}' does not exist at '${ROLLBACK_DIR}'." >&2
  exit 1
fi

TMP_PATH="${MANIFEST_PATH}.tmp"
cat > "${TMP_PATH}" <<EOF
{"activeVersion":"${PREVIOUS_VERSION}","previousVersion":"${ACTIVE_VERSION}","activatedUtc":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
mv "${TMP_PATH}" "${MANIFEST_PATH}"

echo "Rolled back web version '${ACTIVE_VERSION}' -> '${PREVIOUS_VERSION}'."
