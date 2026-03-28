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

for cmd in dotnet npm tar bash; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found in PATH: $cmd" >&2
    exit 1
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_PATH="$REPO_ROOT/src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj"
WEB_UI_DIR="$REPO_ROOT/src/clients/web/ReelRoulette.WebUI"
WEB_UI_DIST="$WEB_UI_DIR/dist"
SHARED_ICON="$REPO_ROOT/assets/HI.ico"

if [[ -z "$Version" ]]; then
  Version="$(sed -n 's:^[[:space:]]*<Version>\(.*\)</Version>.*:\1:p' "$PROJECT_PATH" | head -1)"
  Version="$(echo "$Version" | tr -d '\r')"
  if [[ -z "$Version" ]]; then
    Version="dev"
  fi
fi

PUBLISH_DIR="$REPO_ROOT/artifacts/publish/serverapp-$Runtime"
PACKAGE_ROOT="$REPO_ROOT/$OutputRoot"
STAGING_NAME="ReelRoulette-Server-$Version-$Runtime"
STAGING_DIR="$PACKAGE_ROOT/portable/$STAGING_NAME"
TAR_PATH="$PACKAGE_ROOT/portable/$STAGING_NAME.tar.gz"

rm -rf "$PUBLISH_DIR" "$STAGING_DIR"
rm -f "$TAR_PATH"
mkdir -p "$PUBLISH_DIR" "$STAGING_DIR"

(
  cd "$WEB_UI_DIR"
  npm install
  npm run build
)

if [[ ! -d "$WEB_UI_DIST" ]]; then
  echo "WebUI build output was not found at $WEB_UI_DIST." >&2
  exit 1
fi
if [[ ! -f "$SHARED_ICON" ]]; then
  echo "Shared icon was not found at $SHARED_ICON." >&2
  exit 1
fi

(
  cd "$REPO_ROOT"
  dotnet publish "$PROJECT_PATH" \
    -c "$Configuration" \
    -f net10.0 \
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

PUBLISH_WEBROOT="$PUBLISH_DIR/wwwroot"
mkdir -p "$PUBLISH_WEBROOT"
cp -a "$WEB_UI_DIST"/. "$PUBLISH_WEBROOT/"
cp -f "$SHARED_ICON" "$PUBLISH_WEBROOT/HI.ico"

cp -a "$PUBLISH_DIR"/. "$STAGING_DIR/"

cat > "$STAGING_DIR/run-server.sh" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
# Native libraries (e.g. custom VLC install): prepend to LD_LIBRARY_PATH if needed.
exec ./ReelRoulette.ServerApp "$@"
WRAPPER
chmod +x "$STAGING_DIR/run-server.sh"

if [[ -f "$STAGING_DIR/ReelRoulette.ServerApp" ]]; then
  chmod +x "$STAGING_DIR/ReelRoulette.ServerApp"
fi

cat > "$STAGING_DIR/PACKAGE_INFO.txt" << EOF
ReelRoulette ServerApp portable package
Version: $Version
Runtime: $Runtime

Run: ./run-server.sh
EOF

cat > "$STAGING_DIR/README.txt" << 'EOF'
ReelRoulette Server (Linux portable)

This package is self-contained: a separate .NET runtime install is not required.

Native prerequisites are not bundled. Install ffmpeg (including ffprobe) and VLC /
LibVLC from your distribution if you need media features that depend on them.

Run from this directory:
  ./run-server.sh

Operator UI: http://localhost:45123/operator (default base URL; adjust if configured.)
Health check: GET /health on the configured HTTP listen URL.
EOF

(
  cd "$PACKAGE_ROOT/portable"
  tar -czf "$TAR_PATH" "$STAGING_NAME"
)

echo "Portable package created: $TAR_PATH"
