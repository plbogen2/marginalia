import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import os from 'os';

const DB_DIR = process.env.DB_DIR || path.join(os.homedir(), '.marginalia');
const DB_NAME = process.env.NODE_ENV === 'test' ? `marginalia_test_${process.pid}.db` : 'marginalia.db';
export const DB_PATH = path.join(DB_DIR, DB_NAME);

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
    // Ignore error if column already exists
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ignored_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      workspace_id INTEGER,
      user TEXT,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `);

  try {
    db.exec("ALTER TABLE ignored_words ADD COLUMN user TEXT;");
  } catch (err) {
    // Ignore error if column already exists
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_words_global ON ignored_words(word, user) WHERE workspace_id IS NULL;
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_words_local ON ignored_words(word, workspace_id) WHERE workspace_id IS NOT NULL;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_feedback_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      persona TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_feedback_cache 
    ON ai_feedback_cache(workspace_name, file_path, persona);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS languagetool_cache (
      hash TEXT PRIMARY KEY,
      matches TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workspaces_user_last_opened ON workspaces(user, last_opened DESC);
    CREATE INDEX IF NOT EXISTS idx_workspaces_name_user ON workspaces(name, user COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_ignored_words_workspace_id ON ignored_words(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_ignored_words_user ON ignored_words(user);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ignored_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id TEXT NOT NULL,
      workspace_id INTEGER,
      user TEXT,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `);

  try {
    db.exec("ALTER TABLE ignored_rules ADD COLUMN user TEXT;");
  } catch (err) {
    // Ignore error if column already exists
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_rules_global ON ignored_rules(rule_id, user) WHERE workspace_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_rules_local ON ignored_rules(rule_id, workspace_id) WHERE workspace_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ignored_rules_user ON ignored_rules(user);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ignored_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      workspace_id INTEGER,
      rule_id TEXT NOT NULL,
      context_hash TEXT NOT NULL,
      user TEXT,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `);

  try {
    db.exec("ALTER TABLE ignored_instances ADD COLUMN user TEXT;");
  } catch (err) {
    // Ignore error if column already exists
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_instances_local 
    ON ignored_instances(file_path, workspace_id, rule_id, context_hash) 
    WHERE workspace_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ignored_instances_user ON ignored_instances(user);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT,
      event_type TEXT NOT NULL,
      feature TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created ON analytics_events(user, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_feature ON analytics_events(feature);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT,
      model TEXT NOT NULL,
      feature TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_token_usage_user_created ON ai_token_usage(user, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_token_usage_feature ON ai_token_usage(feature);
  `);
}

export function recordEvent(user: string | null | undefined, event_type: string, feature: string, metadata?: any) {
  try {
    const metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;
    db.prepare(`
      INSERT INTO analytics_events (user, event_type, feature, metadata, created_at)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    `).run(user || 'anonymous', event_type, feature, metaStr);
  } catch (err) {
    console.error('Failed to record analytics event:', err);
  }
}

export function recordTokenUsage(
  user: string | null | undefined,
  model: string,
  feature: string,
  prompt_tokens: number = 0,
  completion_tokens: number = 0,
  total_tokens: number = 0
) {
  try {
    const total = total_tokens || (prompt_tokens + completion_tokens);
    db.prepare(`
      INSERT INTO ai_token_usage (user, model, feature, prompt_tokens, completion_tokens, total_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `).run(user || 'anonymous', model, feature, prompt_tokens, completion_tokens, total);
  } catch (err) {
    console.error('Failed to record AI token usage:', err);
  }
}

export { db };
