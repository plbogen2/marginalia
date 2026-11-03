#!/bin/bash
set -euo pipefail

# Marginalia Automated SQLite Database Backup & Maintenance
# Performs safe online backup and rotates snapshots keeping 7 days.

BACKUP_DIR="/root/.marginalia/backups"
DB_FILE="/root/.marginalia/marginalia.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/marginalia_${TIMESTAMP}.db"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [ -f "$DB_FILE" ]; then
  echo "--> Executing safe online SQLite backup to $BACKUP_FILE..."
  # Use sqlite3 CLI if available, otherwise docker exec against active backend
  if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
  else
    # Fallback to sqlite3 inside the active backend container
    ACTIVE_CONTAINER=$(sudo docker ps --format '{{.Names}}' | grep -E '^marginalia_backend_(blue|green)$' | head -n 1)
    if [ -n "$ACTIVE_CONTAINER" ]; then
      sudo docker exec "$ACTIVE_CONTAINER" node -e "
        const { DatabaseSync } = require('node:sqlite');
        // Checkpoint WAL
        const db = new DatabaseSync('/root/.marginalia/marginalia.db');
        db.exec('PRAGMA wal_checkpoint(PASSIVE);');
        db.close();
      " 2>/dev/null || true
      cp -p "$DB_FILE" "$BACKUP_FILE"
    else
      cp -p "$DB_FILE" "$BACKUP_FILE"
    fi
  fi
  chmod 600 "$BACKUP_FILE"
  echo "--> Backup created successfully: $(ls -lh "$BACKUP_FILE" | awk '{print $5, $9}')"
  
  # Prune backups older than 7 days
  echo "--> Pruning backups older than 7 days..."
  find "$BACKUP_DIR" -name "marginalia_*.db" -type f -mtime +7 -delete 2>/dev/null || true
  echo "--> Backup maintenance complete."
else
  echo "--> Database $DB_FILE not found, skipping."
fi
