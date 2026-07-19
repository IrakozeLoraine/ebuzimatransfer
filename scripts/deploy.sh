#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Paths below are repo-root-relative (osrm-data/, docker-compose.yml).
cd "$SCRIPT_DIR/.."

COMPOSE="docker compose"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

disk_free() { df -h / | awk 'NR==2 {print $4 " free (" $5 " used)"}'; }

GRAPH="osrm-data/rwanda-latest.osrm"

if [[ ! -s "$GRAPH" ]]; then
  log "No OSRM routing graph — building it (several minutes, ~700MB peak RAM)..."
  "$SCRIPT_DIR/osrm-prepare.sh"

  if [[ ! -s "$GRAPH" ]]; then
    echo "osrm-prepare.sh succeeded but $GRAPH is still missing." >&2
    echo "The guard is likely checking the wrong filename. osrm-data/ holds:" >&2
    ls -la osrm-data/ >&2
    exit 1
  fi
fi

log "Disk before: $(disk_free)"

# 1. Remove dangling images left behind by previous deploys.
log "Reclaiming disk..."
docker image prune -f >/dev/null

# 2. Fetch the images CI published to GHCR.
#    Only backend and frontend: db, redis, osrm, nginx and certbot come from
#    Docker Hub, which this host reaches unreliably. Those images are already
#    cached locally and pulling them again risks a TLS timeout for no gain.
#    Set IMAGE_TAG=<git-sha> to roll back to a specific build.
log "Pulling images (tag: ${IMAGE_TAG:-latest})..."
$COMPOSE pull backend frontend

# 3. Start / restart the stack.
log "Starting services..."
$COMPOSE up -d

# 4. Drop the images the new ones just replaced.
log "Trimming replaced images..."
docker image prune -f >/dev/null

log "Disk after:  $(disk_free)"

log "Deploy complete. Running services:"
$COMPOSE ps
