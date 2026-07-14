import test from 'node:test';
import assert from 'node:assert';
import { db } from './db.js';

test('Database Initialization', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table';").all() as { name: string }[];
  const tableNames = tables.map(t => t.name);
  
  assert.ok(tableNames.includes('settings'));
  assert.ok(tableNames.includes('workspaces'));

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);").run('test_key', 'test_value');
  const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get('test_key') as { value: string };
  assert.strictEqual(row.value, 'test_value');

  db.prepare("DELETE FROM settings WHERE key = ?;").run('test_key');
});
