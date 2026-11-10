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

# Snapshot gocryptfs.conf headers and persisted secrets
ENC_BASE="/var/lib/docker/volumes/marginalia_marginalia_data/_data/encrypted_storage"
if [ ! -d "$ENC_BASE" ]; then
  ENC_BASE="/root/.marginalia/encrypted_storage"
fi
if [ -d "$ENC_BASE" ]; then
  for conf in "$ENC_BASE"/*/gocryptfs.conf; do
    if [ -f "$conf" ]; then
      USER_DIR=$(basename "$(dirname "$conf")")
      CONF_BACKUP="$BACKUP_DIR/gocryptfs_${TIMESTAMP}_${USER_DIR}.conf"
      cp -p "$conf" "$CONF_BACKUP"
      chmod 600 "$CONF_BACKUP"
    fi
  done
  find "$BACKUP_DIR" -name "gocryptfs_*.conf" -type f -mtime +7 -delete 2>/dev/null || true
fi

SECRETS_FILE="/etc/marginalia/secrets.env"
if [ -f "$SECRETS_FILE" ]; then
  SECRETS_BACKUP="$BACKUP_DIR/secrets_${TIMESTAMP}.env"
  cp -p "$SECRETS_FILE" "$SECRETS_BACKUP"
  chmod 600 "$SECRETS_BACKUP"
  find "$BACKUP_DIR" -name "secrets_*.env" -type f -mtime +7 -delete 2>/dev/null || true
fi
