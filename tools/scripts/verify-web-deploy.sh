#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/../.."
SERVER_PORT="${1:-51312}"
BASE_URL="http://localhost:${SERVER_PORT}"
WEBUI_PATH="${REPO_ROOT}/src/clients/web/ReelRoulette.WebUI"
DIST_PATH="${WEBUI_PATH}/dist"
if [[ "${OS:-}" == "Windows_NT" ]] || [[ "${MSYSTEM:-}" != "" ]]; then
  FRAMEWORK="net9.0-windows"
else
  FRAMEWORK="net9.0"
fi

pushd "${WEBUI_PATH}" >/dev/null
npm install
npm run build
popd >/dev/null

dotnet run --framework "${FRAMEWORK}" --project "${REPO_ROOT}/src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj" -- \
  --CoreServer:ListenUrl="${BASE_URL}" \
  --ServerApp:WebUiStaticRootPath="${DIST_PATH}" >/tmp/reelroulette-serverapp.log 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
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
[[ -s "${INDEX_BODY}" ]] || { echo "Expected non-empty index response" >&2; exit 1; }

RUNTIME_HEADERS="$(mktemp)"
RUNTIME_BODY="$(mktemp)"
curl -fsS -D "${RUNTIME_HEADERS}" "${BASE_URL}/runtime-config.json" -o "${RUNTIME_BODY}"
RUNTIME_CACHE="$(grep -i '^Cache-Control:' "${RUNTIME_HEADERS}" | awk '{$1=""; print $0}' | xargs)"
[[ "${RUNTIME_CACHE}" == *"no-store"* ]] || { echo "Expected runtime-config no-store cache policy, got '${RUNTIME_CACHE}'" >&2; exit 1; }
grep -q "\"apiBaseUrl\": \"${BASE_URL}\"" "${RUNTIME_BODY}" || { echo "runtime-config apiBaseUrl mismatch" >&2; exit 1; }
grep -q "\"sseUrl\": \"${BASE_URL}/api/events\"" "${RUNTIME_BODY}" || { echo "runtime-config sseUrl mismatch" >&2; exit 1; }

ASSET_PATH="$(grep -Eo 'assets/[^"'"'"']+\.(js|css)' "${INDEX_BODY}" | head -n1)"
[[ -n "${ASSET_PATH}" ]] || { echo "Could not find asset path in index.html" >&2; exit 1; }

ASSET_HEADERS="$(mktemp)"
curl -fsS -D "${ASSET_HEADERS}" "${BASE_URL}/${ASSET_PATH}" -o /dev/null
ASSET_CACHE="$(grep -i '^Cache-Control:' "${ASSET_HEADERS}" | awk '{$1=""; print $0}' | xargs)"
[[ "${ASSET_CACHE}" == *"immutable"* ]] || { echo "Expected immutable asset cache policy, got '${ASSET_CACHE}'" >&2; exit 1; }

curl -fsS "${BASE_URL}/api/capabilities" >/dev/null
curl -fsS "${BASE_URL}/control/status" >/dev/null
curl -fsS "${BASE_URL}/control/settings" >/dev/null
curl -fsS -X POST "${BASE_URL}/control/settings" -H "Content-Type: application/json" -d '{"adminAuthMode":"Off","adminSharedToken":null}' >/dev/null
kill -0 "${SERVER_PID}" >/dev/null 2>&1 || { echo "Server exited during smoke checks" >&2; exit 1; }

echo "Single-origin and control-plane server smoke verification passed."
