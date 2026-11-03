#!/bin/bash
set -euo pipefail

# Marginalia Zero-Downtime Blue/Green Hot Swap Deployment
# Usage:
#   ./scripts/hot_swap.sh backend
#   ./scripts/hot_swap.sh frontend
#   ./scripts/hot_swap.sh all

TARGET="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CADDYFILE="$ROOT_DIR/Caddyfile"

cd "$ROOT_DIR"

echo "=== Starting Marginalia Zero-Downtime Hot Swap [$TARGET] ==="

# Ensure Parlando is running
if ! sudo docker ps --format '{{.Names}}' | grep -q 'marginalia_parlando'; then
  echo "--> Starting Parlando neural voice service..."
  sudo docker-compose up -d --no-deps parlando
fi

# Ensure Caddy is running
if ! sudo docker ps --format '{{.Names}}' | grep -q 'marginalia_caddy'; then
  echo "--> Starting Caddy reverse proxy..."
  sudo docker-compose up -d --no-deps caddy
fi

hot_swap_backend() {
  echo ""
  echo "--- [Hot Swap: Backend API] ---"

  local active_slot="blue"
  local candidate_slot="green"

  if grep -q "marginalia_backend_green:3000" "$CADDYFILE"; then
    active_slot="green"
    candidate_slot="blue"
  elif grep -q "marginalia_backend_blue:3000" "$CADDYFILE"; then
    active_slot="blue"
    candidate_slot="green"
  else
    # Migrating from legacy un-slotted marginalia_backend
    if sudo docker ps --format '{{.Names}}' | grep -q "marginalia_backend_green"; then
      active_slot="green"
      candidate_slot="blue"
    else
      active_slot="blue"
      candidate_slot="green"
    fi
  fi

  echo "--> Active Slot:    marginalia_backend_$active_slot"
  echo "--> Candidate Slot: marginalia_backend_$candidate_slot"

  echo "--> Building candidate image for backend_$candidate_slot..."
  sudo docker-compose build "backend_$candidate_slot"

  echo "--> Launching candidate container marginalia_backend_$candidate_slot..."
  sudo docker-compose up -d --no-deps "backend_$candidate_slot"

  echo "--> Probing candidate health at http://marginalia_backend_$candidate_slot:3000/api/health..."
  local healthy=false
  for i in $(seq 1 40); do
    if sudo docker exec marginalia_caddy wget -q -O - "http://marginalia_backend_${candidate_slot}:3000/api/health" 2>/dev/null | grep -q 'ok'; then
      healthy=true
      echo "--> Candidate backend is 100% HEALTHY and accepting connections (probe $i passed)."
      break
    fi
    sleep 0.5
  done

  if [ "$healthy" != true ]; then
    echo "ERROR: Candidate backend failed health checks within 20 seconds!"
    echo "--> ABORTING deployment. Active container was never touched."
    sudo docker stop "marginalia_backend_$candidate_slot" 2>/dev/null || true
    return 1
  fi

  echo "--> Executing instant Caddy upstream cutover to marginalia_backend_$candidate_slot..."
  sed "s/marginalia_backend\(_blue\|_green\)\?:3000/marginalia_backend_${candidate_slot}:3000/g" "$CADDYFILE" > "$CADDYFILE.tmp"
  cat "$CADDYFILE.tmp" > "$CADDYFILE"
  rm -f "$CADDYFILE.tmp"
  sudo docker exec marginalia_caddy caddy reload --config /etc/caddy/Caddyfile

  echo "--> Draining in-flight requests on old container..."
  sleep 2
  sudo docker stop -t 15 "marginalia_backend_$active_slot" 2>/dev/null || true
  sudo docker stop -t 15 "marginalia_backend" 2>/dev/null || true
  echo "--> Backend hot swap complete! Active slot is now [$candidate_slot]."
}

hot_swap_frontend() {
  echo ""
  echo "--- [Hot Swap: Frontend Web App] ---"

  local active_slot="blue"
  local candidate_slot="green"

  if grep -q "marginalia_frontend_green:80" "$CADDYFILE"; then
    active_slot="green"
    candidate_slot="blue"
  elif grep -q "marginalia_frontend_blue:80" "$CADDYFILE"; then
    active_slot="blue"
    candidate_slot="green"
  else
    # Migrating from legacy un-slotted marginalia_frontend
    if sudo docker ps --format '{{.Names}}' | grep -q "marginalia_frontend_green"; then
      active_slot="green"
      candidate_slot="blue"
    else
      active_slot="blue"
      candidate_slot="green"
    fi
  fi

  echo "--> Active Slot:    marginalia_frontend_$active_slot"
  echo "--> Candidate Slot: marginalia_frontend_$candidate_slot"

  echo "--> Building candidate image for frontend_$candidate_slot..."
  sudo docker-compose build "frontend_$candidate_slot"

  echo "--> Launching candidate container marginalia_frontend_$candidate_slot..."
  sudo docker-compose up -d --no-deps "frontend_$candidate_slot"

  echo "--> Probing candidate health at http://marginalia_frontend_$candidate_slot:80/..."
  local healthy=false
  for i in $(seq 1 30); do
    if sudo docker exec marginalia_caddy wget -q -O - "http://marginalia_frontend_${candidate_slot}:80/" 2>/dev/null | grep -q 'html'; then
      healthy=true
      echo "--> Candidate frontend is 100% HEALTHY and serving static assets (probe $i passed)."
      break
    fi
    sleep 0.5
  done

  if [ "$healthy" != true ]; then
    echo "ERROR: Candidate frontend failed health checks within 15 seconds!"
    echo "--> ABORTING deployment. Active container was never touched."
    sudo docker stop "marginalia_frontend_$candidate_slot" 2>/dev/null || true
    return 1
  fi

  echo "--> Executing instant Caddy upstream cutover to marginalia_frontend_$candidate_slot..."
  sed "s/marginalia_frontend\(_blue\|_green\)\?:80/marginalia_frontend_${candidate_slot}:80/g" "$CADDYFILE" > "$CADDYFILE.tmp"
  cat "$CADDYFILE.tmp" > "$CADDYFILE"
  rm -f "$CADDYFILE.tmp"
  sudo docker exec marginalia_caddy caddy reload --config /etc/caddy/Caddyfile

  echo "--> Draining in-flight connections on old container..."
  sleep 1
  sudo docker stop -t 10 "marginalia_frontend_$active_slot" 2>/dev/null || true
  sudo docker stop -t 10 "marginalia_frontend" 2>/dev/null || true
  echo "--> Frontend hot swap complete! Active slot is now [$candidate_slot]."
}

case "$TARGET" in
  backend)
    hot_swap_backend
    ;;
  frontend)
    hot_swap_frontend
    ;;
  all)
    hot_swap_backend
    hot_swap_frontend
    ;;
  *)
    echo "Unknown target: $TARGET. Usage: $0 [backend|frontend|all]"
    exit 1
    ;;
esac

echo ""
echo "=== Marginalia Hot Swap Successful! Container Status: ==="
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
