#!/usr/bin/env bash
#
# Install locally built AppImages from artifacts/packages/appimage/ into a fixed
# user directory with stable filenames (no version segment), then run --install
# on each to refresh Freedesktop menu entries and icons. Same idea as the
# GitHub installer, but sources the repo build output instead of a release.
#
# Prerequisites: run the AppImage package scripts first, e.g.:
#   ./tools/scripts/package-serverapp-linux-appimage.sh
#   ./tools/scripts/package-desktop-linux-appimage.sh
#
# Usage:
#   ./tools/scripts/install-linux-local.sh
#
# Environment:
#   REELROULETTE_LOCAL_APPIMAGE_DIR  install directory (default: ~/.local/share/ReelRoulette)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APPIMAGE_DIR="$REPO_ROOT/artifacts/packages/appimage"
INSTALL_DIR="${REELROULETTE_LOCAL_APPIMAGE_DIR:-$HOME/.local/share/ReelRoulette}"
DESKTOP_DIR="$HOME/.local/share/applications"

usage() {
  cat <<'EOF'
Usage: ./tools/scripts/install-linux-local.sh

Copies ReelRoulette-*.AppImage from artifacts/packages/appimage/ into the install
directory with stable names (ReelRoulette-Server-linux-x64.AppImage and
ReelRoulette-Desktop-linux-x64.AppImage), then runs each with --install.

Set REELROULETTE_LOCAL_APPIMAGE_DIR to override the install directory.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

# ReelRoulette-Server-{any-version}-linux-x64.AppImage -> ReelRoulette-Server-linux-x64.AppImage
# (same sed as install-linux-from-github.sh; supports e.g. 0.11.0 and 0.11.0-dev)
stable_basename() {
  local base="$1"
  echo "$base" | sed 's/^\(ReelRoulette-\(Server\|Desktop\)\)-.*-\(linux-x64\.AppImage\)$/\1-\3/'
}

mkdir -p "$INSTALL_DIR" "$DESKTOP_DIR"

shopt -s nullglob
built=( "$APPIMAGE_DIR"/ReelRoulette-*.AppImage )
shopt -u nullglob

if [[ ${#built[@]} -eq 0 ]]; then
  echo "No ReelRoulette-*.AppImage found under $APPIMAGE_DIR" >&2
  echo "Build AppImages first, e.g. ./tools/scripts/package-serverapp-linux-appimage.sh" >&2
  exit 1
fi

for src in "${built[@]}"; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  stable="$(stable_basename "$name")"
  if [[ "$stable" == "$name" ]]; then
    echo "WARN: could not derive stable name for $name; copying as-is" >&2
    stable="$name"
  fi
  install -m0755 "$src" "$INSTALL_DIR/$stable"
  echo "Installed: $INSTALL_DIR/$stable"
done

shopt -s nullglob
installed=( "$INSTALL_DIR"/ReelRoulette-*.AppImage )
shopt -u nullglob

for app in "${installed[@]}"; do
  [[ -f "$app" ]] || continue
  echo "Running --install: $app" >&2
  if ! "$app" --install; then
    echo "WARN: --install failed for $app (menu entry may be stale)" >&2
  fi
done

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo "Done."
