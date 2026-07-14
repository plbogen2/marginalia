import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_DIR = '/usr/local/google/home/plbogen/.gemini/jetski';
const DB_PATH = path.join(DB_DIR, 'marginalia.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db: DatabaseSync;

try {
  db = new DatabaseSync(DB_PATH);
  initTables();
} catch (err) {
  console.error('Failed to initialize SQLite database:', err);
  throw err;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT,
      last_opened INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);
}

export { db };
