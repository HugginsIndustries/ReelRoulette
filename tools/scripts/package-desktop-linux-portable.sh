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

if ! command -v dotnet >/dev/null 2>&1; then
  echo "dotnet SDK not found in PATH." >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "tar not found in PATH." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_PATH="$REPO_ROOT/src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj"

if [[ -z "$Version" ]]; then
  Version="$(sed -n 's:^[[:space:]]*<Version>\(.*\)</Version>.*:\1:p' "$PROJECT_PATH" | head -1)"
  Version="$(echo "$Version" | tr -d '\r')"
  if [[ -z "$Version" ]]; then
    Version="dev"
  fi
fi

PUBLISH_DIR="$REPO_ROOT/artifacts/publish/desktop-$Runtime"
PACKAGE_ROOT="$REPO_ROOT/$OutputRoot"
STAGING_NAME="ReelRoulette-Desktop-$Version-$Runtime"
STAGING_DIR="$PACKAGE_ROOT/portable/$STAGING_NAME"
TAR_PATH="$PACKAGE_ROOT/portable/$STAGING_NAME.tar.gz"

rm -rf "$PUBLISH_DIR" "$STAGING_DIR"
rm -f "$TAR_PATH"
mkdir -p "$PUBLISH_DIR" "$STAGING_DIR"

(
  cd "$REPO_ROOT"
  dotnet publish "$PROJECT_PATH" \
    -c "$Configuration" \
    -r "$Runtime" \
    --self-contained true \
    -p:PublishSingleFile=false \
    -p:PublishTrimmed=false \
    -p:Version="$Version" \
    -p:ErrorOnDuplicatePublishOutputFiles=false \
    -p:DebugType=none \
    -p:DebugSymbols=false \
    -p:StripSymbols=true \
    -o "$PUBLISH_DIR"
)

find "$PUBLISH_DIR" -type f -name '*.pdb' -delete

cp -a "$PUBLISH_DIR"/. "$STAGING_DIR/"

cat > "$STAGING_DIR/run-desktop.sh" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
# LibVLC: ensure VLC is installed (e.g. vlc package). For non-standard installs,
# prepend the directory containing libvlc.so to LD_LIBRARY_PATH.
exec ./ReelRoulette.DesktopApp "$@"
WRAPPER
chmod +x "$STAGING_DIR/run-desktop.sh"

if [[ -f "$STAGING_DIR/ReelRoulette.DesktopApp" ]]; then
  chmod +x "$STAGING_DIR/ReelRoulette.DesktopApp"
fi

cat > "$STAGING_DIR/PACKAGE_INFO.txt" << EOF
ReelRoulette Desktop portable package
Version: $Version
Runtime: $Runtime

Run: ./run-desktop.sh
EOF

cat > "$STAGING_DIR/README.txt" << 'EOF'
ReelRoulette Desktop (Linux portable)

This package is self-contained: a separate .NET runtime install is not required.

Native prerequisites are not bundled. Install:
  - ffmpeg (ffprobe on PATH) for duration and related media helpers
  - VLC / LibVLC for video playback (system packages are used when nothing is bundled)

Run from this directory:
  ./run-desktop.sh
EOF

(
  cd "$PACKAGE_ROOT/portable"
  tar -czf "$TAR_PATH" "$STAGING_NAME"
)

echo "Portable package created: $TAR_PATH"
