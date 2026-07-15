import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_DIR = '/usr/local/google/home/plbogen/.gemini/jetski';
const DB_NAME = process.env.NODE_ENV === 'test' ? 'marginalia_test.db' : 'marginalia.db';
const DB_PATH = path.join(DB_DIR, DB_NAME);

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
      last_opened INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      user TEXT
    );
  `);

  try {
    db.exec("ALTER TABLE workspaces ADD COLUMN user TEXT;");
  } catch (err) {
    // Ignore error if column already exists (e.g. table already altered)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ignored_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      workspace_id INTEGER,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_words_global ON ignored_words(word) WHERE workspace_id IS NULL;
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_words_local ON ignored_words(word, workspace_id) WHERE workspace_id IS NOT NULL;
  `);
}

export { db };
