#!/usr/bin/env bash
# Copies the data folder the server uses into a new artifacts/scratch/live-copy-<timestamp>/ folder in this checkout,
# so it can be measured or inspected without touching the original, and prints that folder's path.
# It copies the catalog and the settings files; --thumbnails and --logs add the thumbnails folder and last.log.
# It never writes to the data folder and takes no destination.
set -euo pipefail

copy_thumbnails=0
copy_logs=0
for arg in "$@"; do
    case "$arg" in
        --thumbnails) copy_thumbnails=1 ;;
        --logs) copy_logs=1 ;;
        *)
            echo "Unknown argument '$arg'. Usage: $0 [--thumbnails] [--logs]" >&2
            echo "The copy always goes to a new artifacts/scratch/live-copy-<timestamp>/ folder." >&2
            exit 2
            ;;
    esac
done

if ! command -v sqlite3 >/dev/null; then
    echo "sqlite3 is not installed." >&2
    exit 1
fi

# The server's own lookup: REELROULETTE_DATA_DIR, trimmed, holds the data and its thumbnails/ folder. Otherwise
# .NET's ApplicationData and LocalApplicationData, which follow XDG_CONFIG_HOME and XDG_DATA_HOME when they are absolute.
override="${REELROULETTE_DATA_DIR:-}"
override="${override#"${override%%[![:space:]]*}"}"
override="${override%"${override##*[![:space:]]}"}"
if [[ -n "$override" ]]; then
    source_dir="$(realpath -ms -- "$override")"
    thumbnails_dir="$source_dir/thumbnails"
else
    config_home="${XDG_CONFIG_HOME:-}"
    [[ "$config_home" == /* ]] || config_home="$HOME/.config"
    data_home="${XDG_DATA_HOME:-}"
    [[ "$data_home" == /* ]] || data_home="$HOME/.local/share"
    source_dir="$config_home/ReelRoulette"
    thumbnails_dir="$data_home/ReelRoulette/thumbnails"
fi

if [[ ! -d "$source_dir" ]]; then
    echo "No ReelRoulette data folder at $source_dir." >&2
    exit 1
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p -- "$repo_root/artifacts/scratch"
destination="$repo_root/artifacts/scratch/live-copy-$(date +%Y-%m-%d-%H%M%S)"
if ! mkdir -- "$destination"; then
    echo "Could not create $destination." >&2
    exit 1
fi
# A failed run leaves no partial copy behind.
trap '[[ $? == 0 ]] || rm -rf -- "$destination"' EXIT
echo "Copying $source_dir" >&2

# A read-only SQLite open of the WAL catalog leaves -wal and -shm files beside it, so the backup opens it immutable,
# which writes nothing. That reads without locks, so it runs only while no server connection is open (no -wal file)
# and keeps the copy only if the catalog file didn't change meanwhile; a write ends with a checkpoint that changes it.
catalog="$source_dir/library.db"
# SQLite reads the path in a file: URI with %XX decoded and ending at ? or #.
catalog_uri="${catalog//\%/%25}"
catalog_uri="${catalog_uri//\?/%3F}"
catalog_uri="${catalog_uri//\#/%23}"
catalog_state() {
    if [[ -e "$catalog-wal" ]]; then
        echo open
    else
        stat -c '%i %s %.9Y' -- "$catalog"
    fi
}

if [[ -f "$catalog" ]]; then
    copied=0
    waiting=0
    for _ in $(seq 120); do
        before="$(catalog_state)"
        if [[ "$before" != open ]]; then
            sqlite3 -readonly "file:$catalog_uri?mode=ro&immutable=1" ".backup '$destination/library.db'"
            if [[ "$(catalog_state)" == "$before" ]]; then
                copied=1
                break
            fi
        fi
        if [[ "$waiting" == 0 ]]; then
            echo "Waiting for the server to finish with the catalog." >&2
            waiting=1
        fi
        sleep 0.25
    done
    if [[ "$copied" != 1 ]]; then
        echo "The catalog kept changing for 30 seconds, so no consistent copy was made. Try again once the server is idle." >&2
        exit 1
    fi
    echo "  library.db" >&2
else
    echo "  No library.db to copy." >&2
fi

for settings in "$source_dir"/*.json; do
    [[ -f "$settings" ]] || continue
    cp -p -- "$settings" "$destination/"
    echo "  $(basename -- "$settings")" >&2
done

if [[ "$copy_logs" == 1 ]]; then
    if [[ -f "$source_dir/last.log" ]]; then
        cp -p -- "$source_dir/last.log" "$destination/"
        echo "  last.log" >&2
    else
        echo "  No last.log to copy." >&2
    fi
fi

if [[ "$copy_thumbnails" == 1 ]]; then
    if [[ -d "$thumbnails_dir" ]]; then
        # -H copies the folder a symlinked thumbnails/ points to, not a link back to the live folder.
        cp -rpH -- "$thumbnails_dir" "$destination/thumbnails"
        echo "  thumbnails/ from $thumbnails_dir" >&2
    else
        echo "  No thumbnails folder at $thumbnails_dir." >&2
    fi
fi

echo "$destination"
