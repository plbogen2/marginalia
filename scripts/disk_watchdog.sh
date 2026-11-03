#!/bin/bash
set -euo pipefail

# Marginalia Automated Disk Space Watchdog & Auto-Remediator
# Checks disk usage on root partition (/) and executes staged emergency pruning.

THRESHOLD_WARN=75
THRESHOLD_CRIT=85
ROOT_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
LOG_FILE="/var/log/marginalia_disk_watchdog.log"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

log() {
  echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$TIMESTAMP] $1"
}

if [ "$ROOT_USAGE" -ge "$THRESHOLD_CRIT" ]; then
  log "CRITICAL: Root disk usage at ${ROOT_USAGE}% (threshold: ${THRESHOLD_CRIT}%). Initiating aggressive pruning..."
  
  # 1. Prune Docker build cache down to 500MB
  docker builder prune -af --keep-storage 500MB >/dev/null 2>&1 || true
  
  # 2. Prune old images and stopped containers
  docker image prune -af --filter "until=24h" >/dev/null 2>&1 || true
  docker container prune -f >/dev/null 2>&1 || true
  
  # 3. Vacuum systemd journal to 50MB
  journalctl --vacuum-size=50M >/dev/null 2>&1 || true
  
  # 4. Clean APT cache
  apt-get clean >/dev/null 2>&1 || true

  # 5. Prune backups older than 2 days in emergency
  find /var/backups/marginalia -name "marginalia_*.db" -type f -mtime +2 -delete 2>/dev/null || true
  
  NEW_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
  log "AGGRESSIVE PRUNE COMPLETE: Disk usage reduced from ${ROOT_USAGE}% to ${NEW_USAGE}%."

elif [ "$ROOT_USAGE" -ge "$THRESHOLD_WARN" ]; then
  log "WARNING: Root disk usage at ${ROOT_USAGE}% (threshold: ${THRESHOLD_WARN}%). Initiating routine cleanup..."
  
  # Routine cleanup
  docker builder prune -f --keep-storage 1GB >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  journalctl --vacuum-size=100M >/dev/null 2>&1 || true
  apt-get clean >/dev/null 2>&1 || true
  
  NEW_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
  log "ROUTINE PRUNE COMPLETE: Disk usage reduced from ${ROOT_USAGE}% to ${NEW_USAGE}%."
fi
