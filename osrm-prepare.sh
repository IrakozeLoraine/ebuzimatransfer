#!/usr/bin/env bash
# One-time OSRM data preparation. Turns a Rwanda OpenStreetMap extract into the
# .osrm.* files that osrm-routed needs to serve routes.
set -euo pipefail

cd "$(dirname "$0")"

REGION_URLS=(
  "https://download.openstreetmap.fr/extracts/africa/rwanda-latest.osm.pbf"
)
DATA_DIR="./osrm-data"
PBF="rwanda-latest.osm.pbf"
BASE="rwanda-latest"
OSRM_IMAGE="osrm/osrm-backend:latest"
# The car profile ships inside the image; ambulances route as regular vehicles.
PROFILE="/opt/car.lua"

STOP_OLLAMA=0
[[ "${1:-}" == "--stop-ollama" ]] && STOP_OLLAMA=1

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

mem_free() { free -m | awk 'NR==2 {print $7 "MB available"}'; }

# osrm-extract needs roughly 1GB for an extract this size; bail early rather than
# dying halfway through and leaving a partial .osrm set behind.
if [[ $(free -m | awk 'NR==2 {print $7}') -lt 1200 && $STOP_OLLAMA -eq 0 ]]; then
  echo "Only $(mem_free) — osrm-extract may be OOM-killed." >&2
  echo "Free up memory, or re-run with --stop-ollama to stop Ollama for the duration." >&2
  exit 1
fi

if [[ $STOP_OLLAMA -eq 1 ]]; then
  log "Stopping Ollama for the duration of the extract..."
  systemctl stop ollama
  # Restart it however this script exits, including on failure.
  trap 'log "Restarting Ollama..."; systemctl start ollama' EXIT
fi

mkdir -p "$DATA_DIR"

log "Memory before: $(mem_free)"

# 1. Obtain the region extract.
if [[ -s "$DATA_DIR/$PBF" ]]; then
  log "Using existing extract ($(du -h "$DATA_DIR/$PBF" | cut -f1))"
else
  for url in "${REGION_URLS[@]}"; do
    log "Downloading from ${url%%/extracts*}..."
    # Fail fast: without these, a blackholed body stalls until the TCP timeout.
    if curl -fL --connect-timeout 10 --max-time 600 --speed-limit 1024 --speed-time 30 \
         -o "$DATA_DIR/$PBF.part" "$url"; then
      mv "$DATA_DIR/$PBF.part" "$DATA_DIR/$PBF"
      break
    fi
    rm -f "$DATA_DIR/$PBF.part"
    echo "  ↪ mirror failed, trying next..." >&2
  done

  if [[ ! -s "$DATA_DIR/$PBF" ]]; then
    cat >&2 <<EOF

Every mirror failed. Stage the file by hand from a machine with connectivity:

  curl -fLO ${REGION_URLS[0]}
  scp $PBF root@<this-host>:${PWD}/${DATA_DIR#./}/

Then re-run this script; it will pick the file up and skip the download.
EOF
    exit 1
  fi
fi

# Guard against a truncated or wrong-format file reaching osrm-extract.
# Every OSM PBF carries an "OSMHeader" blob in its first bytes.
if ! head -c 64 "$DATA_DIR/$PBF" | grep -qa "OSMHeader"; then
  echo "$DATA_DIR/$PBF is not a valid OSM PBF (no OSMHeader) — truncated or wrong file." >&2
  echo "Delete it and re-stage." >&2
  exit 1
fi

# 2. Parse the PBF into OSRM's graph representation.
log "Extracting (this is the slow, memory-hungry stage)..."
docker run --rm -v "$PWD/$DATA_DIR:/data" "$OSRM_IMAGE" \
  osrm-extract -p "$PROFILE" "/data/$PBF"

# 3. Build the multi-level partition used by the MLD algorithm.
log "Partitioning..."
docker run --rm -v "$PWD/$DATA_DIR:/data" "$OSRM_IMAGE" \
  osrm-partition "/data/$BASE.osrm"

# 4. Weight the partition cells. This is the stage to re-run alone if you ever
#    swap in a different traffic profile.
log "Customizing..."
docker run --rm -v "$PWD/$DATA_DIR:/data" "$OSRM_IMAGE" \
  osrm-customize "/data/$BASE.osrm"

log "Memory after: $(mem_free)"

log "Done. Prepared files in $DATA_DIR:"
du -sh "$DATA_DIR"
