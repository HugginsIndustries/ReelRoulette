#!/usr/bin/env bash
set -euo pipefail

# Headless HTTP smoke for the Velopack Linux server AppImage (same endpoints as legacy portable smoke).
# When FUSE is unavailable (typical CI), --appimage-extract-and-run extracts to a temp dir and runs the payload.

usage() {
  echo "Usage: $0 [path/to/ReelRoulette.Server-*.AppImage]" >&2
  echo "  With no argument: builds a local Velopack server AppImage (publish + WebUI stage + vpk pack), then smokes it." >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VPK_VERSION="${VPK_VERSION:-1.2.0}"

appimage=""
if [[ $# -gt 1 ]]; then
  usage
fi
if [[ $# -eq 1 ]]; then
  appimage="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
fi

build_velopack_server_appimage() {
  if ! command -v dotnet >/dev/null 2>&1; then
    echo "dotnet is required on PATH to build the Velopack server AppImage." >&2
    exit 1
  fi
  if ! command -v pwsh >/dev/null 2>&1; then
    echo "pwsh is required on PATH for WebUI staging." >&2
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required on PATH for WebUI staging." >&2
    exit 1
  fi

  local version_file bare assembly publish_dir out_dir
  version_file="$(tr -d '\r\n' < "$REPO_ROOT/.version" | xargs)"
  if [[ -z "$version_file" ]]; then
    echo ".version is empty; cannot determine pack version." >&2
    exit 1
  fi
  bare="${version_file#v}"
  assembly="$(printf '%s' "$bare" | sed -E 's/^([0-9]+\.[0-9]+\.[0-9]+).*/\1/').0"

  publish_dir="$(mktemp -d)"
  out_dir="$(mktemp -d)"
  trap 'rm -rf "$publish_dir" "$out_dir"' RETURN

  dotnet publish "$REPO_ROOT/src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj" \
    -c Release -r linux-x64 --self-contained true \
    -f net10.0 \
    -p:PublishSingleFile=false -p:PublishTrimmed=false \
    -p:Version="$bare" -p:AssemblyVersion="$assembly" -p:FileVersion="$assembly" \
    -p:ErrorOnDuplicatePublishOutputFiles=false \
    -o "$publish_dir"

  pwsh "$REPO_ROOT/tools/scripts/stage-webui-assets.ps1" -RepoRoot "$REPO_ROOT" -PublishDir "$publish_dir"

  dotnet tool install --global vpk --version "$VPK_VERSION" >/dev/null 2>&1 || true
  export PATH="${HOME}/.dotnet/tools:${PATH}"

  vpk pack \
    -o "$out_dir" \
    --channel linux-server-smoke \
    --packId ReelRoulette.Server \
    --packVersion "$bare" \
    --packDir "$publish_dir" \
    --mainExe ReelRoulette.ServerApp \
    --packTitle "ReelRoulette Server" \
    --icon "$REPO_ROOT/assets/HI-256.png"

  shopt -s nullglob
  local built=("$out_dir"/ReelRoulette.Server*.AppImage)
  shopt -u nullglob
  if [[ ${#built[@]} -eq 0 ]]; then
    echo "vpk pack did not produce a ReelRoulette.Server AppImage under $out_dir" >&2
    ls -la "$out_dir" >&2 || true
    exit 1
  fi

  appimage="${built[0]}"
  local dest_dir="$REPO_ROOT/artifacts/velopack-smoke"
  mkdir -p "$dest_dir"
  local dest="$dest_dir/$(basename "$appimage")"
  cp -f "$appimage" "$dest"
  appimage="$dest"
  trap - RETURN
  rm -rf "$publish_dir" "$out_dir"
}

if [[ -z "$appimage" ]]; then
  build_velopack_server_appimage
fi

if [[ ! -f "$appimage" ]]; then
  echo "AppImage not found: $appimage" >&2
  exit 1
fi
if [[ ! -x "$appimage" ]]; then
  chmod +x "$appimage"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required on PATH." >&2
  exit 1
fi

port="$(python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1', 0)); print(s.getsockname()[1]); s.close()")"
listen_url="http://127.0.0.1:${port}"
health_url="${listen_url}/health"
version_url="${listen_url}/api/version"
status_url="${listen_url}/control/status"
operator_url="${listen_url}/operator"

work="$(mktemp -d)"
out_log="$work/server.out"
err_log="$work/server.err"

# Verification scripts must not read or write the developer's real ApplicationData settings.
# .NET uses XDG_CONFIG_HOME on Linux for SpecialFolder.ApplicationData (ReelRoulette under config home).
isolated_config_home="$work/isolated-config-home"
mkdir -p "$isolated_config_home"

server_pid=""
cleanup() {
  if [[ -n "${server_pid}" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

(
  exec env -u DISPLAY -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS \
    XDG_CONFIG_HOME="$isolated_config_home" \
    "$appimage" --appimage-extract-and-run --CoreServer:ListenUrl="$listen_url"
) >"$out_log" 2>"$err_log" &
server_pid=$!

ready=false
for _ in $(seq 1 120); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Server process exited before health check. stdout:" >&2
    cat "$out_log" >&2 || true
    echo "stderr:" >&2
    cat "$err_log" >&2 || true
    exit 1
  fi
  if curl -sfS --max-time 2 "$health_url" >/dev/null; then
    ready=true
    break
  fi
  sleep 0.5
done

if [[ "$ready" != true ]]; then
  echo "Timed out waiting for GET $health_url" >&2
  cat "$out_log" >&2 || true
  cat "$err_log" >&2 || true
  exit 1
fi

if ! curl -sfS --max-time 5 "$version_url" >/dev/null; then
  echo "Expected GET $version_url to succeed." >&2
  exit 1
fi

if ! curl -sfS --max-time 5 "$status_url" >/dev/null; then
  echo "Expected GET $status_url to succeed." >&2
  exit 1
fi

if ! curl -sfS --max-time 5 "$operator_url" >/dev/null; then
  echo "Expected GET $operator_url to succeed (Operator UI)." >&2
  exit 1
fi

cleanup
trap - EXIT

echo "Packaged server smoke OK ($appimage @ $listen_url)."
