#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE="docker compose"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

disk_free() { df -h / | awk 'NR==2 {print $4 " free (" $5 " used)"}'; }

GRAPH="osrm-data/rwanda-latest.osrm"

if [[ ! -s "$GRAPH" ]]; then
  log "No OSRM routing graph — building it (several minutes, ~700MB peak RAM)..."
  ./osrm-prepare.sh

  if [[ ! -s "$GRAPH" ]]; then
    echo "osrm-prepare.sh succeeded but $GRAPH is still missing." >&2
    echo "The guard is likely checking the wrong filename. osrm-data/ holds:" >&2
    ls -la osrm-data/ >&2
    exit 1
  fi
fi

log "Disk before: $(disk_free)"

# 1. Remove dangling images left behind by previous rebuilds.
log "Reclaiming disk before build..."
docker image prune -f >/dev/null

# 2. Build the images.
log "Building images..."
$COMPOSE build

# 3. Start / restart the stack.
log "Starting services..."
$COMPOSE up -d

# 4. Clean up after the build so the build cache doesn't grow unbounded.
log "Trimming build cache and dangling images..."
docker builder prune -f --keep-storage 3g >/dev/null
docker image prune -f >/dev/null

log "Disk after:  $(disk_free)"

log "Deploy complete. Running services:"
$COMPOSE ps
