#!/usr/bin/env bash
set -euo pipefail

Runtime="linux-x64"
Configuration="Release"
Version=""
OutputRoot="artifacts/packages"

usage() {
  echo "Usage: $0 [-Version <ver>] [-Configuration <cfg>] [-OutputRoot <path>]" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -Version)
      [[ $# -lt 2 ]] && usage
      Version="$2"
      shift 2
      ;;
    -Configuration)
      [[ $# -lt 2 ]] && usage
      Configuration="$2"
      shift 2
      ;;
    -OutputRoot)
      [[ $# -lt 2 ]] && usage
      OutputRoot="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=lib/appimage-helpers.sh
source "$SCRIPT_DIR/lib/appimage-helpers.sh"

reelroulette_appimage_require_tools

PORTABLE_SCRIPT="$SCRIPT_DIR/package-serverapp-linux-portable.sh"
portable_args=(-Configuration "$Configuration" -OutputRoot "$OutputRoot")
[[ -n "${Version:-}" ]] && portable_args+=(-Version "$Version")
bash "$PORTABLE_SCRIPT" "${portable_args[@]}"

PROJECT_PATH="$REPO_ROOT/src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj"
if [[ -z "$Version" ]]; then
  Version="$(sed -n 's:^[[:space:]]*<Version>\(.*\)</Version>.*:\1:p' "$PROJECT_PATH" | head -1)"
  Version="$(echo "$Version" | tr -d '\r')"
  if [[ -z "$Version" ]]; then
    Version="dev"
  fi
fi

STAGING_NAME="ReelRoulette-Server-$Version-$Runtime"
TAR_PATH="$REPO_ROOT/$OutputRoot/portable/$STAGING_NAME.tar.gz"
OUT_APPIMAGE="$REPO_ROOT/$OutputRoot/appimage/ReelRoulette-Server-$Version-$Runtime.AppImage"

reelroulette_appimage_build_from_tar \
  "$REPO_ROOT" \
  "$TAR_PATH" \
  "$OUT_APPIMAGE" \
  "$STAGING_NAME" \
  reelroulette-server \
  run-server.sh \
  reelroulette-server \
  "ReelRoulette Server" \
  "ReelRoulette media server" \
  "$Version"

chmod +x "$OUT_APPIMAGE"
echo "AppImage created: $OUT_APPIMAGE"
