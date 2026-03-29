#!/usr/bin/env bash
#
# Install the latest Linux release from GitHub (AppImage preferred, portable tar.gz fallback).
# Communicates with GitHub over TLS only; release asset checksums are not verified here.
#
# Usage:
#   ./tools/scripts/install-linux-from-github.sh server|desktop
#   curl -fsSL https://raw.githubusercontent.com/HugginsIndustries/ReelRoulette/main/tools/scripts/install-linux-from-github.sh | bash -s -- server
#
# Environment:
#   REELROULETTE_GITHUB_REPO        owner/repo (default: HugginsIndustries/ReelRoulette)
#   REELROULETTE_ICONS_BRANCH       branch for raw icon URLs when using tarball fallback (default: main)
#   REELROULETTE_LOCAL_APPIMAGE_DIR AppImage install directory (default: ~/.local/share/ReelRoulette)
#
set -euo pipefail

DEFAULT_REPO="HugginsIndustries/ReelRoulette"
DEFAULT_ICONS_BRANCH="main"

usage() {
  echo "Usage: $0 [-Repo owner/repo] [-Branch icons-branch] server|desktop" >&2
  echo "  AppImage: ~/.local/share/ReelRoulette/ with stable filenames (override: REELROULETTE_LOCAL_APPIMAGE_DIR)." >&2
  echo "  Portable tarball: ~/.local/share/ReelRoulette/<target>/<version> + ~/.local/bin symlink (no sudo)." >&2
}

REPO="${REELROULETTE_GITHUB_REPO:-$DEFAULT_REPO}"
ICONS_BRANCH="${REELROULETTE_ICONS_BRANCH:-$DEFAULT_ICONS_BRANCH}"
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -Repo)
      [[ $# -lt 2 ]] && { usage; exit 1; }
      REPO="$2"
      shift 2
      ;;
    -Branch)
      [[ $# -lt 2 ]] && { usage; exit 1; }
      ICONS_BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    server|desktop)
      TARGET="$1"
      shift
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  read -r -p "Install [server] or [desktop]? " TARGET
  TARGET="$(echo "$TARGET" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
fi

if [[ "$TARGET" != "server" && "$TARGET" != "desktop" ]]; then
  echo "Target must be server or desktop." >&2
  exit 1
fi

for cmd in curl jq tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found in PATH: $cmd" >&2
    exit 1
  fi
done

COMPONENT=""
ICON_STEM=""
BIN_LINK_NAME=""
case "$TARGET" in
  server)
    COMPONENT="Server"
    ICON_STEM="reelroulette-server"
    BIN_LINK_NAME="reelroulette-server"
    ;;
  desktop)
    COMPONENT="Desktop"
    ICON_STEM="reelroulette-desktop"
    BIN_LINK_NAME="reelroulette-desktop"
    ;;
esac

API_URL="https://api.github.com/repos/${REPO}/releases/latest"
echo "Fetching latest release from $REPO ..." >&2
JSON="$(curl -fsSL "$API_URL")"

pick_url() {
  local pattern="$1"
  echo "$JSON" | jq -r --arg pat "$pattern" '.assets[] | select(.name | test($pat)) | .browser_download_url' | head -n1
}

APPIMAGE_URL="$(pick_url "^ReelRoulette-${COMPONENT}-.+-linux-x64\\.AppImage\$")"
TAR_URL="$(pick_url "^ReelRoulette-${COMPONENT}-.+-linux-x64\\.tar\\.gz\$")"

if [[ -z "$APPIMAGE_URL" && -z "$TAR_URL" ]]; then
  echo "No matching AppImage or .tar.gz asset found for ReelRoulette-${COMPONENT}-* on latest release." >&2
  exit 1
fi

APPIMAGE_INSTALL_DIR="${REELROULETTE_LOCAL_APPIMAGE_DIR:-$HOME/.local/share/ReelRoulette}"
mkdir -p "$HOME/.local/share/ReelRoulette"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ -n "$APPIMAGE_URL" ]]; then
  NAME="$(basename "$APPIMAGE_URL")"
  STABLE_NAME="$(echo "$NAME" | sed 's/^\(ReelRoulette-\(Server\|Desktop\)\)-.*-\(linux-x64\.AppImage\)$/\1-\3/')"
  mkdir -p "$APPIMAGE_INSTALL_DIR"
  DEST="$APPIMAGE_INSTALL_DIR/$STABLE_NAME"
  echo "Downloading AppImage: $NAME" >&2
  curl -fsSL "$APPIMAGE_URL" -o "$TMP/$NAME"
  install -m0755 "$TMP/$NAME" "$DEST"
  echo "Running --install to register menu entry and icons ..." >&2
  "$DEST" --install
  echo "Installed: $DEST" >&2
  exit 0
fi

mkdir -p "$HOME/.local/bin"

NAME="$(basename "$TAR_URL")"
echo "Downloading portable package: $NAME (no AppImage on this release)" >&2
curl -fsSL "$TAR_URL" -o "$TMP/archive.tar.gz"

# Top-level directory inside tarball matches ReelRoulette-Component-Version-linux-x64
TOP="$(tar -tzf "$TMP/archive.tar.gz" | head -n1 | cut -d/ -f1)"
VERSION="$(echo "$TOP" | sed -n "s/^ReelRoulette-${COMPONENT}-\\(.*\\)-linux-x64\$/\\1/p")"
if [[ -z "$VERSION" ]]; then
  echo "Could not parse version from tarball root: $TOP" >&2
  exit 1
fi

INSTALL_PARENT="$HOME/.local/share/ReelRoulette/${TARGET}"
INSTALL_ROOT="$INSTALL_PARENT/$VERSION"
rm -rf "$INSTALL_ROOT"
mkdir -p "$INSTALL_PARENT"
tar -xzf "$TMP/archive.tar.gz" -C "$INSTALL_PARENT"
EXTRACTED="$INSTALL_PARENT/$TOP"
if [[ ! -d "$EXTRACTED" ]]; then
  echo "Unexpected tarball layout; expected directory: $EXTRACTED" >&2
  exit 1
fi
mv "$EXTRACTED" "$INSTALL_ROOT"

RUN_SCRIPT=""
[[ "$TARGET" == "server" ]] && RUN_SCRIPT="$INSTALL_ROOT/run-server.sh"
[[ "$TARGET" == "desktop" ]] && RUN_SCRIPT="$INSTALL_ROOT/run-desktop.sh"
chmod +x "$RUN_SCRIPT"
[[ -f "$INSTALL_ROOT/ReelRoulette.ServerApp" ]] && chmod +x "$INSTALL_ROOT/ReelRoulette.ServerApp" || true
[[ -f "$INSTALL_ROOT/ReelRoulette.DesktopApp" ]] && chmod +x "$INSTALL_ROOT/ReelRoulette.DesktopApp" || true

mkdir -p "$HOME/.local/share/icons/hicolor/256x256/apps"
mkdir -p "$HOME/.local/share/icons/hicolor/512x512/apps"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${ICONS_BRANCH}/assets"
echo "Fetching menu icons from ${RAW_BASE} ..." >&2
curl -fsSL "${RAW_BASE}/HI-256.png" -o "$HOME/.local/share/icons/hicolor/256x256/apps/${ICON_STEM}.png"
curl -fsSL "${RAW_BASE}/HI-512.png" -o "$HOME/.local/share/icons/hicolor/512x512/apps/${ICON_STEM}.png"

mkdir -p "$HOME/.local/share/applications"
DESKTOP_NAME=""
DESKTOP_COMMENT=""
CATEGORIES=""
case "$TARGET" in
  server)
    DESKTOP_NAME="ReelRoulette Server"
    DESKTOP_COMMENT="ReelRoulette media server"
    CATEGORIES="AudioVideo;Network;"
    ;;
  desktop)
    DESKTOP_NAME="ReelRoulette Desktop"
    DESKTOP_COMMENT="ReelRoulette desktop client"
    CATEGORIES="AudioVideo;Player;"
    ;;
esac

DESKTOP_FILE="$HOME/.local/share/applications/${ICON_STEM}.desktop"
{
  echo "[Desktop Entry]"
  echo "Type=Application"
  # Version= is the Desktop Entry specification version, not the app release.
  echo "Version=1.0"
  echo "X-AppImage-Version=$VERSION"
  echo "Name=$DESKTOP_NAME"
  echo "Comment=$DESKTOP_COMMENT"
  echo "Icon=${ICON_STEM}"
  printf 'Exec=%q\n' "$RUN_SCRIPT"
  echo "Terminal=false"
  echo "Categories=$CATEGORIES"
} > "$DESKTOP_FILE"
chmod 0644 "$DESKTOP_FILE"

ln -sf "$RUN_SCRIPT" "$HOME/.local/bin/${BIN_LINK_NAME}"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

echo "Extracted to: $INSTALL_ROOT" >&2
echo "Symlink: $HOME/.local/bin/${BIN_LINK_NAME} -> $RUN_SCRIPT" >&2
echo "Menu entry: $DESKTOP_FILE" >&2
