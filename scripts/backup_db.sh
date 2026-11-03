#!/bin/bash
set -euo pipefail

# Marginalia Automated SQLite Database Backup & Maintenance
# Performs safe online backup and rotates snapshots keeping 7 days.

BACKUP_DIR="/var/backups/marginalia"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/marginalia_${TIMESTAMP}.db"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

DB_FILE="/var/lib/docker/volumes/marginalia_marginalia_data/_data/marginalia.db"
if [ ! -f "$DB_FILE" ]; then
  DB_FILE="/root/.marginalia/marginalia.db"
fi

if [ -f "$DB_FILE" ]; then
  echo "--> Executing safe online SQLite backup to $BACKUP_FILE..."
  if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
  else
    cp -p "$DB_FILE" "$BACKUP_FILE"
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
