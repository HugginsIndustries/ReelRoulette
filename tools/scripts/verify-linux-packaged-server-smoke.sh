#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [path/to/ReelRoulette-Server-*-linux-x64.tar.gz]" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

tarball=""
if [[ $# -gt 1 ]]; then
  usage
fi
if [[ $# -eq 1 ]]; then
  tarball="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
else
  shopt -s nullglob
  candidates=("$REPO_ROOT"/artifacts/packages/portable/ReelRoulette-Server-*-linux-x64.tar.gz)
  shopt -u nullglob
  if [[ ${#candidates[@]} -eq 0 ]]; then
    echo "No server portable tarball found under artifacts/packages/portable/. Pass an explicit path or run packaging first." >&2
    exit 1
  fi
  tarball="${candidates[0]}"
  for f in "${candidates[@]}"; do
    if [[ "$f" -nt "$tarball" ]]; then
      tarball="$f"
    fi
  done
fi

if [[ ! -f "$tarball" ]]; then
  echo "Tarball not found: $tarball" >&2
  exit 1
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

tar -xzf "$tarball" -C "$work"
root_dir="$(find "$work" -mindepth 1 -maxdepth 1 -type d | head -1)"
if [[ -z "$root_dir" ]]; then
  echo "Expected a single top-level directory in $tarball" >&2
  exit 1
fi

out_log="$work/server.out"
err_log="$work/server.err"

# Force headless host UI on Linux: DBus session address alone can select tray; unset display/session vars.
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
  cd "$root_dir"
  exec env -u DISPLAY -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS \
    ./run-server.sh --CoreServer:ListenUrl="$listen_url"
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

echo "Packaged server smoke OK ($tarball @ $listen_url)."
