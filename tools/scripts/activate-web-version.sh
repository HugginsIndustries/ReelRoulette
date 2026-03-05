#!/usr/bin/env bash
set -euo pipefail

VERSION_ID="${1:-}"
DEPLOY_ROOT="${2:-}"

if [[ -z "${VERSION_ID}" ]]; then
  echo "Usage: activate-web-version.sh <versionId> [deployRoot]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/../.."
if [[ -z "${DEPLOY_ROOT}" ]]; then
  DEPLOY_ROOT="${REPO_ROOT}/.web-deploy"
fi

VERSION_DIR="${DEPLOY_ROOT}/versions/${VERSION_ID}"
if [[ ! -d "${VERSION_DIR}" ]]; then
  echo "Version '${VERSION_ID}' does not exist at '${VERSION_DIR}'." >&2
  exit 1
fi

MANIFEST_PATH="${DEPLOY_ROOT}/active-manifest.json"
PREVIOUS_VERSION=""
if [[ -f "${MANIFEST_PATH}" ]]; then
  PREVIOUS_VERSION="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(m.activeVersion||'');" "${MANIFEST_PATH}")"
fi

mkdir -p "${DEPLOY_ROOT}"
TMP_PATH="${MANIFEST_PATH}.tmp"
cat > "${TMP_PATH}" <<EOF
{"activeVersion":"${VERSION_ID}","previousVersion":"${PREVIOUS_VERSION}","activatedUtc":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
mv "${TMP_PATH}" "${MANIFEST_PATH}"

echo "Activated web version '${VERSION_ID}'."
