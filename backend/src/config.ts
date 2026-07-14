import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DIR = path.resolve(__dirname, '../../');

export const IGNORED_DIRS = ['.git', 'node_modules', 'backend', 'frontend', 'dist'];

export function getTargetDir(): string {
  if (process.env.TARGET_DIR) {
    return process.env.TARGET_DIR;
  }
  
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'active_workspace_path';").get() as { value: string } | undefined;
    if (row && row.value) {
      return row.value;
    }
  } catch (err) {
    console.error('Failed to get active workspace from DB:', err);
  }
  
  return DEFAULT_DIR;
}

export function setTargetDir(dir: string): void {
  const normalized = path.resolve(dir);
  
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_workspace_path', ?);").run(normalized);
    
    const name = path.basename(normalized);
    db.prepare(`
      INSERT INTO workspaces (path, name, last_opened) 
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(path) DO UPDATE SET last_opened=strftime('%s', 'now');
    `).run(normalized, name);
  } catch (err) {
    console.error('Failed to set active workspace in DB:', err);
    throw err;
  }
}

export function getRecentWorkspaces(): { path: string, name: string, last_opened: number }[] {
  try {
    return db.prepare("SELECT path, name, last_opened FROM workspaces ORDER BY last_opened DESC LIMIT 10;").all() as any;
  } catch (err) {
    console.error('Failed to get recent workspaces:', err);
    return [];
  }
}

export function getActiveWorkspaceId(): number | null {
  const activePath = getTargetDir();
  try {
    const row = db.prepare("SELECT id FROM workspaces WHERE path = ?;").get(activePath) as { id: number } | undefined;
    return row ? row.id : null;
  } catch (err) {
    console.error('Failed to get active workspace ID:', err);
    return null;
  }
}

export function getActiveWorkspaceName(): string {
  const activePath = getTargetDir();
  try {
    const row = db.prepare("SELECT name FROM workspaces WHERE path = ?;").get(activePath) as { name: string } | undefined;
    if (row && row.name) {
      return row.name;
    }
  } catch (err) {
    console.error('Failed to get active workspace name:', err);
  }
  return path.basename(activePath);
}

export function selectWorkspaceByName(name: string): string | null {
  try {
    const row = db.prepare("SELECT path FROM workspaces WHERE name = ? COLLATE NOCASE;").get(name) as { path: string } | undefined;
    if (row && row.path) {
      setTargetDir(row.path);
      return row.path;
    }
  } catch (err) {
    console.error('Failed to select workspace by name:', err);
  }
  return null;
}
