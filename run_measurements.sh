#!/usr/bin/env bash
#
# Collects the performance measurements for the eBuzimaTransfer research paper.
#
#   ./run_measurements.sh smoke   # short run: confirms the box survives
#   ./run_measurements.sh full    # Generates Figures
#   ./run_measurements.sh ws      # Mutates real occupancy data
#   ./run_measurements.sh all     # smoke -> full -> ws
#   ./run_measurements.sh facts   # server specs + DB row counts for methodology

set -euo pipefail

cd "$(dirname "$0")"

MEDICAL_ID="${EBUZIMA_MEDICAL_ID:-SA-0001}"
OUT_DIR=/app/loadtest_results
HOST_OUT=./server_results

# Constraint 1: --requests-per-level MUST exceed the largest --levels value.
FULL_LEVELS=(50 100 250 500 750 1000)
FULL_RPL=10000
SMOKE_LEVELS=(50 100)
SMOKE_RPL=2000

WS_UPDATES=50
WS_RESOURCE_ID="${EBUZIMA_WS_RESOURCE_ID:-}"

die()  { echo "ERROR: $*" >&2; exit 1; }
note() { echo; echo "=== $* ==="; }

# --- preflight -------------------------------------------------------------
# Guards the two things that actually went wrong when this was run by hand.

preflight() {
  docker compose ps --status running --services 2>/dev/null | grep -qx backend \
    || die "backend container is not running (docker compose up -d backend)"

  # A second concurrent load test contaminates both runs and can OOM a 2-core box
  if pgrep -af "scripts/loadtest\.py" >/dev/null 2>&1; then
    echo "A load test is ALREADY RUNNING:" >&2
    pgrep -af "scripts/loadtest\.py" >&2
    die "refusing to start a second one. Wait for it, or kill it deliberately."
  fi
  if pgrep -af "scripts/ws_propagation\.py" >/dev/null 2>&1; then
    die "ws_propagation.py is already running; refusing to overlap."
  fi

  local load cores
  load=$(awk '{print $1}' /proc/loadavg)
  cores=$(nproc)
  if awk -v l="$load" -v c="$cores" 'BEGIN{exit !(l > c)}'; then
    echo "WARNING: load average ${load} exceeds ${cores} cores. Results will be" >&2
    echo "         noisy and the saturation knee will read early. Ctrl-C to wait" >&2
    echo "         for a quieter hour; continuing in 10s..." >&2
    sleep 10
  fi
}

get_password() {
  if [[ -z "${EBUZIMA_PASSWORD:-}" ]]; then
    read -rsp "Password for ${MEDICAL_ID}: " EBUZIMA_PASSWORD
    echo
  fi
  [[ -n "$EBUZIMA_PASSWORD" ]] || die "empty password"
}

# psutil drives the CPU/memory sampling and is not in the
# production image. Installing it does not restart the container.
ensure_psutil() {
  docker compose exec -T backend python -c 'import psutil' 2>/dev/null && return
  note "Installing psutil (not in the prod image)"
  docker compose exec -T backend pip install --quiet psutil
}

# --- measurements ----------------------------------------------------------

#   --api-pid 1   PID 1 is the shell from the compose `command:`; the sampler
#                 walks down to the uvicorn children. Backend container only --
#                 not Postgres, not Redis.
#   --timeout 3   Defines "successful" as answered within 3s, a clinician's
#                 patience during an emergency. Without it uvicorn queues
#                 rather than rejects and the success-rate figure is a flat
#                 100% line that says nothing.
#   --no-figure   matplotlib is not in the production image; plot from the CSV.
run_loadtest() {
  local label=$1; shift
  local rpl=$1; shift
  local levels=("$@")
  local max=0
  for l in "${levels[@]}"; do (( l > max )) && max=$l; done
  (( rpl > max )) || die "requests-per-level ($rpl) must exceed max level ($max)"

  ensure_psutil
  note "Load test [${label}]: levels ${levels[*]}, ${rpl} requests/level"
  echo "Started $(date -u +%FT%TZ). Expect roughly 45-90 min for the full ladder."

  # ulimit -n: 1000 concurrent sockets blows through the default 1024 fd limit
  # and the failures show up as network errors indistinguishable from real
  # saturation. python -u: unbuffered, otherwise stdout sits in the pipe buffer
  # and the run looks hung for its entire duration with zero progress output.
  docker compose exec -T backend sh -c "ulimit -n 65535 && exec python -u scripts/loadtest.py \
    --base-url http://localhost:8000 \
    --medical-id '$MEDICAL_ID' --password '$EBUZIMA_PASSWORD' \
    --levels ${levels[*]} \
    --requests-per-level $rpl \
    --api-pid 1 --timeout 3 \
    --no-figure --out-dir '${OUT_DIR}/${label}'" 2>&1 | tee "loadtest_${label}.log"
}

run_ws() {
  note "WebSocket propagation: ${WS_UPDATES} updates"
  local args=(
    --base-url http://localhost:8000
    --medical-id "$MEDICAL_ID" --password "$EBUZIMA_PASSWORD"
    --updates "$WS_UPDATES"
    --no-figure --out-dir "${OUT_DIR}/ws"
  )
  [[ -n "$WS_RESOURCE_ID" ]] && args+=(--resource-id "$WS_RESOURCE_ID")

  docker compose exec -T backend python scripts/ws_propagation.py "${args[@]}" \
    | tee /tmp/ws_propagation.log

  if grep -q "could not restore counts" /tmp/ws_propagation.log; then
    echo >&2
    echo "*** RESTORE FAILED -- that facility is left with test data in it." >&2
    echo "*** Set its occupancy back manually before staff read it." >&2
    exit 1
  fi
}

# Reproducibility context for the methodology section.
facts() {
  note "Server"
  echo "date_utc: $(date -u +%FT%TZ)"
  echo "cores:    $(nproc)"
  echo "kernel:   $(uname -r)"
  free -h | sed 's/^/  /'

  note "Deployment"
  echo "Production runs a SINGLE uvicorn worker: docker-compose.yml's command:"
  echo "overrides the Dockerfile's --workers 4. The saturation knee therefore"
  echo "appears far earlier than a 4-worker deployment would show."
  # procps is not installed in the backend image, so walk /proc directly.
  echo "uvicorn processes in the backend container:"
  docker compose exec -T backend sh -c \
    'for p in /proc/[0-9]*; do c=$(tr "\0" " " < $p/cmdline 2>/dev/null); \
     case "$c" in *uvicorn*) echo "  ${p#/proc/}: $c";; esac; done' \
    | grep -v 'cmdline' || true

  note "Database row counts at test time"
  docker compose exec -T db psql -U ebuzimauser -d ebuzimadb -c "
    SELECT relname AS table, n_live_tup AS rows
    FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"

  note "Neighbours sharing this host"
  echo "OSRM and Ollama run on the host and contend for the same 2 cores."
  echo "CPU in Figure 5.5 samples the backend container only, but wall-clock"
  echo "response times include their contention."
}

collect() {
  note "Copying results to ${HOST_OUT}"
  rm -rf "$HOST_OUT"
  docker compose cp "backend:${OUT_DIR}" "$HOST_OUT"
  find "$HOST_OUT" -name '*.csv' | sort
}

# --- main ------------------------------------------------------------------

case "${1:-}" in
  smoke)
    preflight; get_password
    run_loadtest smoke "$SMOKE_RPL" "${SMOKE_LEVELS[@]}"
    collect
    ;;
  full)
    preflight; get_password
    run_loadtest full "$FULL_RPL" "${FULL_LEVELS[@]}"
    collect
    ;;
  ws)
    preflight; get_password
    run_ws
    collect
    ;;
  all)
    preflight; get_password
    run_loadtest smoke "$SMOKE_RPL" "${SMOKE_LEVELS[@]}"
    echo "Smoke run finished. Review ${HOST_OUT}/smoke/results.csv before the"
    echo "full ladder. Continuing in 20s -- Ctrl-C to stop here."
    sleep 20
    run_loadtest full "$FULL_RPL" "${FULL_LEVELS[@]}"
    run_ws
    write_referral_template
    facts | tee "${HOST_OUT}_facts.txt"
    collect
    ;;
  template) write_referral_template; collect ;;
  facts)    facts ;;
  *)
    sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac

note "Done"