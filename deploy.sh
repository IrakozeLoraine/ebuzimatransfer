#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE="docker compose"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

disk_free() { df -h / | awk 'NR==2 {print $4 " free (" $5 " used)"}'; }

log "Disk before: $(disk_free)"

# 1. Remove dangling images left behind by previous rebuilds.
log "Reclaiming disk before build..."
docker builder prune -af >/dev/null
docker image prune -af >/dev/null

# 2. Build the images.
log "Building images..."
$COMPOSE build

# 3. Start / restart the stack.
log "Starting services..."
$COMPOSE up -d

# 4. Clean up after the build so the build cache doesn't grow unbounded.
log "Cleaning build cache and dangling images..."
docker builder prune -af >/dev/null
docker image prune -f >/dev/null

log "Disk after:  $(disk_free)"

log "Deploy complete. Running services:"
$COMPOSE ps
