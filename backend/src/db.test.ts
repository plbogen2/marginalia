import test from 'node:test';
import assert from 'node:assert';
import { db } from './db.js';

test('Database Initialization', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table';").all() as { name: string }[];
  const tableNames = tables.map(t => t.name);
  
  assert.ok(tableNames.includes('settings'));
  assert.ok(tableNames.includes('workspaces'));
  assert.ok(tableNames.includes('ignored_words'));

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);").run('test_key', 'test_value');
  const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get('test_key') as { value: string };
  assert.strictEqual(row.value, 'test_value');

  db.prepare("DELETE FROM settings WHERE key = ?;").run('test_key');

  // Test ignored_words constraints
  db.prepare("DELETE FROM ignored_words;").run();

  // Test global uniqueness (workspace_id = null)
  db.prepare("INSERT INTO ignored_words (word, workspace_id) VALUES (?, ?);").run('hello', null);
  assert.throws(() => {
    db.prepare("INSERT INTO ignored_words (word, workspace_id) VALUES (?, ?);").run('hello', null);
  }, /UNIQUE constraint failed/);

  // Test workspace uniqueness (workspace_id = 1)
  db.prepare("INSERT INTO ignored_words (word, workspace_id) VALUES (?, ?);").run('hello', 1);
  assert.throws(() => {
    db.prepare("INSERT INTO ignored_words (word, workspace_id) VALUES (?, ?);").run('hello', 1);
  }, /UNIQUE constraint failed/);

  // Can insert same word for a different workspace
  db.prepare("INSERT INTO ignored_words (word, workspace_id) VALUES (?, ?);").run('hello', 2);

  // Clean up
  db.prepare("DELETE FROM ignored_words;").run();
});
