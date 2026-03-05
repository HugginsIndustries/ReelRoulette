#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/../.."
DEPLOY_ROOT="${1:-${REPO_ROOT}/.web-deploy-smoke}"
WEB_HOST_PORT="${2:-51312}"
BASE_URL="http://localhost:${WEB_HOST_PORT}"

PUBLISH_SCRIPT="${SCRIPT_DIR}/publish-web.sh"
ACTIVATE_SCRIPT="${SCRIPT_DIR}/activate-web-version.sh"
ROLLBACK_SCRIPT="${SCRIPT_DIR}/rollback-web-version.sh"
WEB_HOST_PROJECT="${REPO_ROOT}/src/clients/web/ReelRoulette.WebHost/ReelRoulette.WebHost.csproj"

rm -rf "${DEPLOY_ROOT}"

VERSION1="m7c-smoke-v1-$(date -u +%Y%m%d%H%M%S)"
VERSION2="m7c-smoke-v2-$(date -u +%Y%m%d%H%M%S)"

"${PUBLISH_SCRIPT}" "${VERSION1}" "${DEPLOY_ROOT}"
SKIP_INSTALL=true "${PUBLISH_SCRIPT}" "${VERSION2}" "${DEPLOY_ROOT}"
"${ACTIVATE_SCRIPT}" "${VERSION1}" "${DEPLOY_ROOT}"

dotnet run --project "${WEB_HOST_PROJECT}" -- \
  --WebDeployment:ListenUrl="${BASE_URL}" \
  --WebDeployment:DeployRootPath="${DEPLOY_ROOT}" >/tmp/reelroulette-webhost.log 2>&1 &
WEB_HOST_PID=$!

cleanup() {
  if kill -0 "${WEB_HOST_PID}" >/dev/null 2>&1; then
    kill "${WEB_HOST_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

INDEX_HEADERS="$(mktemp)"
INDEX_BODY="$(mktemp)"
curl -fsS -D "${INDEX_HEADERS}" "${BASE_URL}/" -o "${INDEX_BODY}"

ACTIVE_V1="$(grep -i '^X-ReelRoulette-Web-Version:' "${INDEX_HEADERS}" | awk '{print $2}' | tr -d '\r')"
[[ "${ACTIVE_V1}" == "${VERSION1}" ]] || { echo "Expected active version ${VERSION1}, got ${ACTIVE_V1}" >&2; exit 1; }

INDEX_CACHE="$(grep -i '^Cache-Control:' "${INDEX_HEADERS}" | awk '{$1=""; print $0}' | xargs)"
[[ "${INDEX_CACHE}" == *"no-store"* ]] || { echo "Expected index no-store cache policy, got '${INDEX_CACHE}'" >&2; exit 1; }

RUNTIME_HEADERS="$(mktemp)"
curl -fsS -D "${RUNTIME_HEADERS}" "${BASE_URL}/runtime-config.json" -o /dev/null
RUNTIME_CACHE="$(grep -i '^Cache-Control:' "${RUNTIME_HEADERS}" | awk '{$1=""; print $0}' | xargs)"
[[ "${RUNTIME_CACHE}" == *"no-store"* ]] || { echo "Expected runtime-config no-store cache policy, got '${RUNTIME_CACHE}'" >&2; exit 1; }

ASSET_PATH="$(grep -Eo 'assets/[^"'"'"']+\.(js|css)' "${INDEX_BODY}" | head -n1)"
[[ -n "${ASSET_PATH}" ]] || { echo "Could not find asset path in index.html" >&2; exit 1; }

ASSET_HEADERS="$(mktemp)"
curl -fsS -D "${ASSET_HEADERS}" "${BASE_URL}/${ASSET_PATH}" -o /dev/null
ASSET_CACHE="$(grep -i '^Cache-Control:' "${ASSET_HEADERS}" | awk '{$1=""; print $0}' | xargs)"
[[ "${ASSET_CACHE}" == *"immutable"* ]] || { echo "Expected immutable asset cache policy, got '${ASSET_CACHE}'" >&2; exit 1; }

"${ACTIVATE_SCRIPT}" "${VERSION2}" "${DEPLOY_ROOT}"
sleep 0.4
ACTIVE_V2="$(curl -fsS -D - "${BASE_URL}/" -o /dev/null | grep -i '^X-ReelRoulette-Web-Version:' | awk '{print $2}' | tr -d '\r')"
[[ "${ACTIVE_V2}" == "${VERSION2}" ]] || { echo "Expected active version ${VERSION2}, got ${ACTIVE_V2}" >&2; exit 1; }
kill -0 "${WEB_HOST_PID}" >/dev/null 2>&1 || { echo "Web host exited during activation switch" >&2; exit 1; }

"${ROLLBACK_SCRIPT}" "${DEPLOY_ROOT}"
sleep 0.4
ACTIVE_ROLLBACK="$(curl -fsS -D - "${BASE_URL}/" -o /dev/null | grep -i '^X-ReelRoulette-Web-Version:' | awk '{print $2}' | tr -d '\r')"
[[ "${ACTIVE_ROLLBACK}" == "${VERSION1}" ]] || { echo "Expected rollback version ${VERSION1}, got ${ACTIVE_ROLLBACK}" >&2; exit 1; }
kill -0 "${WEB_HOST_PID}" >/dev/null 2>&1 || { echo "Web host exited during rollback switch" >&2; exit 1; }

echo "M7c web deploy smoke verification passed."
