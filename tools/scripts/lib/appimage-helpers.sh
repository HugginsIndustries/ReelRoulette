#!/usr/bin/env bash
# Sourced by package-*-linux-appimage.sh — not executed directly.

set -euo pipefail

reelroulette_appimage_require_tools() {
  if ! command -v appimagetool >/dev/null 2>&1; then
    echo "appimagetool not found on PATH. Install AppImageKit (appimagetool) and retry." >&2
    exit 1
  fi
  if ! command -v tar >/dev/null 2>&1; then
    echo "tar not found in PATH." >&2
    exit 1
  fi
}

# Args: repo_root tarball_path output_appimage_path extract_dir_name lib_subdir run_script icon_stem desktop_name desktop_comment package_version
reelroulette_appimage_build_from_tar() {
  local repo_root="$1"
  local tarball_path="$2"
  local output_appimage_path="$3"
  local extract_dir_name="$4"
  local lib_subdir="$5"
  local run_script="$6"
  local icon_stem="$7"
  local desktop_name="$8"
  local desktop_comment="$9"
  local package_version="${10:-dev}"

  if [[ ! -f "$tarball_path" ]]; then
    echo "Portable tarball not found: $tarball_path" >&2
    exit 1
  fi

  local png256="$repo_root/assets/HI-256.png"
  local png512="$repo_root/assets/HI-512.png"
  if [[ ! -f "$png256" ]] || [[ ! -f "$png512" ]]; then
    echo "Missing $png256 or $png512 (required for AppImage icons)." >&2
    exit 1
  fi

  local work
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN

  local appdir="$work/AppDir"
  local payload="$appdir/usr/lib/$lib_subdir"
  mkdir -p "$payload"
  mkdir -p "$appdir/usr/share/applications"
  mkdir -p "$appdir/usr/share/icons/hicolor/256x256/apps"
  mkdir -p "$appdir/usr/share/icons/hicolor/512x512/apps"

  tar -xzf "$tarball_path" -C "$work"
  if [[ ! -d "$work/$extract_dir_name" ]]; then
    echo "Expected top-level directory $extract_dir_name inside tarball." >&2
    exit 1
  fi
  cp -a "$work/$extract_dir_name"/. "$payload/"

  install -m0644 "$png256" "$appdir/usr/share/icons/hicolor/256x256/apps/${icon_stem}.png"
  install -m0644 "$png512" "$appdir/usr/share/icons/hicolor/512x512/apps/${icon_stem}.png"
  # appimagetool resolves Icon=<stem> as AppDir/<stem>.png; without this file the tool exits non-zero and no .AppImage is produced.
  install -m0644 "$png256" "$appdir/${icon_stem}.png"

  # Single main Freedesktop category (semicolon-terminated per spec; avoids multiple-main hints).
  local desktop_categories="AudioVideo;"

  reelroulette_appimage_write_apprun "$appdir/AppRun" "$lib_subdir" "$run_script" "$icon_stem" "$desktop_name" "$desktop_comment" "$desktop_categories" "$package_version"
  chmod 0755 "$appdir/AppRun"

  local desktop_id="${icon_stem}.desktop"
  reelroulette_appimage_write_desktop_file "$appdir/$desktop_id" "$desktop_name" "$desktop_comment" "$icon_stem" "$desktop_categories" "$package_version"
  cp -a "$appdir/$desktop_id" "$appdir/usr/share/applications/$desktop_id"

  mkdir -p "$(dirname "$output_appimage_path")"
  rm -f "$output_appimage_path"

  (
    cd "$work"
    if ! ARCH=x86_64 appimagetool --no-appstream "$appdir" "$output_appimage_path"; then
      echo "appimagetool failed. Common causes: missing AppDir/<Icon>.png matching Icon= in the .desktop, or incomplete AppDir layout. See appimagetool output above." >&2
      exit 1
    fi
  )
}

# shellcheck disable=SC2016
reelroulette_appimage_write_apprun() {
  local dest="$1"
  local lib_subdir="$2"
  local run_script="$3"
  local icon_stem="$4"
  local desktop_name="$5"
  local desktop_comment="$6"
  local desktop_categories="$7"
  local package_version="$8"

  local help_text
  if [[ "$lib_subdir" == reelroulette-server ]]; then
    help_text="$(cat <<'EOS'
ReelRoulette Server (Linux AppImage)

Usage: ReelRoulette-Server-*.AppImage [options]

  --help, -h    Show this message
  --install     Register menu entry and icons under your user account (no sudo)

This bundle includes a self-contained .NET runtime.

Native prerequisites are not bundled. Install from your distribution:
  - ffmpeg (including ffprobe) for media features that depend on them
  - VLC / LibVLC where server media features require them

Operator UI (default): http://localhost:45123/operator
Health check: GET /health on the configured HTTP listen URL.
EOS
)"
  else
    help_text="$(cat <<'EOS'
ReelRoulette Desktop (Linux AppImage)

Usage: ReelRoulette-Desktop-*.AppImage [options]

  --help, -h    Show this message
  --install     Register menu entry and icons under your user account (no sudo)

This bundle includes a self-contained .NET runtime.

Native prerequisites are not bundled. Install:
  - ffmpeg (ffprobe on PATH) for duration and related media helpers
  - VLC / LibVLC for video playback (system packages are used when nothing is bundled)
EOS
)"
  fi
  help_text+=$'\n\n'"Package version: ${package_version}"$'\n'

  # Single-quote HERE for static parts; inject dynamic values safely.
  {
    echo '#!/usr/bin/env bash'
    echo 'set -euo pipefail'
    echo 'APPDIR="${APPDIR:-"$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"}"'
    echo "HERE=\"\$APPDIR/usr/lib/$lib_subdir\""
    echo 'export PATH="$HERE:${PATH:-}"'
    echo 'ICON_STEM="'"$icon_stem"'"'
    echo 'DESKTOP_FILE="$HOME/.local/share/applications/'"$icon_stem"'.desktop"'
    echo ''
    echo 'if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then'
    echo "  cat <<'RR_HELP_EOF'"
    printf '%s\n' "$help_text"
    echo 'RR_HELP_EOF'
    echo '  exit 0'
    echo 'fi'
    echo ''
    echo 'if [[ "${1:-}" == "--install" ]]; then'
    echo '  TARGET="${APPIMAGE:-}"'
    echo '  if [[ -z "$TARGET" ]]; then'
    echo '    echo "APPIMAGE is unset. Run --install from the .AppImage file (double-click or path on disk), not from an extracted tree." >&2'
    echo '    exit 1'
    echo '  fi'
    echo '  mkdir -p "$HOME/.local/share/applications"'
    echo '  mkdir -p "$HOME/.local/share/icons/hicolor/256x256/apps"'
    echo '  mkdir -p "$HOME/.local/share/icons/hicolor/512x512/apps"'
    echo '  install -m0644 "$APPDIR/usr/share/icons/hicolor/256x256/apps/${ICON_STEM}.png" \'
    echo '    "$HOME/.local/share/icons/hicolor/256x256/apps/${ICON_STEM}.png"'
    echo '  install -m0644 "$APPDIR/usr/share/icons/hicolor/512x512/apps/${ICON_STEM}.png" \'
    echo '    "$HOME/.local/share/icons/hicolor/512x512/apps/${ICON_STEM}.png"'
    echo '  {'
    echo '    echo "[Desktop Entry]"'
    echo '    echo "Type=Application"'
    # Version= is the Desktop Entry *specification* version (1.0), not the app release.
    echo '    echo "Version=1.0"'
    echo "    echo \"X-AppImage-Version=$package_version\""
    echo '    echo "Name='"$desktop_name"'"'
    echo '    echo "Comment='"$desktop_comment"'"'
    echo '    echo "Icon=${ICON_STEM}"'
    echo '    printf "Exec=%q %U\n" "$TARGET"'
    echo '    echo "Terminal=false"'
    echo "    echo \"Categories=$desktop_categories\""
    echo '  } > "$DESKTOP_FILE"'
    echo '  chmod 0644 "$DESKTOP_FILE"'
    echo '  if command -v update-desktop-database >/dev/null 2>&1; then'
    echo '    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true'
    echo '  fi'
    echo '  exit 0'
    echo 'fi'
    echo ''
    echo 'cd "$HERE"'
    echo 'exec bash "./'"$run_script"'" "$@"'
  } > "$dest"
}

reelroulette_appimage_write_desktop_file() {
  local path="$1"
  local name="$2"
  local comment="$3"
  local icon="$4"
  local categories="$5"
  local package_version="$6"
  {
    echo "[Desktop Entry]"
    echo "Type=Application"
    # Version= is the Desktop Entry *specification* version (1.0), not the app release.
    echo "Version=1.0"
    echo "X-AppImage-Version=$package_version"
    echo "Name=$name"
    echo "Comment=$comment"
    echo "TryExec=AppRun"
    echo "Exec=AppRun %U"
    echo "Icon=$icon"
    echo "Terminal=false"
    echo "Categories=$categories"
    echo "X-AppImage-Integrate=false"
  } > "$path"
}
