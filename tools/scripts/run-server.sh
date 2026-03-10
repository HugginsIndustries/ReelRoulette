#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-45123}"
REQUIRE_AUTH="${REQUIRE_AUTH:-false}"
BIND_ON_LAN="${BIND_ON_LAN:-false}"
TRUST_LOCALHOST="${TRUST_LOCALHOST:-true}"
PAIRING_TOKEN="${PAIRING_TOKEN:-reelroulette-dev-token}"

if [[ "${BIND_ON_LAN}" == "true" ]]; then
  LISTEN_HOST="0.0.0.0"
else
  LISTEN_HOST="localhost"
fi

LISTEN_URL="http://${LISTEN_HOST}:${PORT}"
HEALTH_URL="http://localhost:${PORT}/health"
DEFAULT_WEBUI_DIST="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/src/clients/web/ReelRoulette.WebUI/dist"

export CoreServer__ListenUrl="${LISTEN_URL}"
export CoreServer__RequireAuth="${REQUIRE_AUTH}"
export CoreServer__BindOnLan="${BIND_ON_LAN}"
export CoreServer__TrustLocalhost="${TRUST_LOCALHOST}"
export CoreServer__PairingToken="${PAIRING_TOKEN}"
export ServerApp__WebUiStaticRootPath="${ServerApp__WebUiStaticRootPath:-${DEFAULT_WEBUI_DIST}}"

echo "Starting ReelRoulette.ServerApp..."
echo "  Listen URL: ${LISTEN_URL}"
echo "  Health URL: ${HEALTH_URL}"
echo "  WebUI static root: ${ServerApp__WebUiStaticRootPath}"
echo "  Require auth: ${REQUIRE_AUTH}"
echo "  Bind on LAN: ${BIND_ON_LAN}"
echo "  Trust localhost: ${TRUST_LOCALHOST}"
if [[ "${REQUIRE_AUTH}" == "true" ]]; then
  echo "  Pairing token: ${PAIRING_TOKEN}"
fi
echo "Verification hint: curl ${HEALTH_URL}"

dotnet run --project "./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj"
