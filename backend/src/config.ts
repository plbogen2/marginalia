import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DIR = path.resolve(__dirname, '../../');

export const IGNORED_DIRS = ['.git', 'node_modules', 'backend', 'frontend', 'dist'];

export function getStorageDir(): string {
  return process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.resolve(os.homedir(), '.marginalia/storage');
}

export function getUserStorageRoot(username: string): string {
  return path.join(getStorageDir(), username);
}

export function getTargetDir(req?: any): string {
  const username = req?.user;
  if (username) {
    let workspaceName = '';
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(`active_workspace_path:${username}`) as { value: string } | undefined;
      if (row && row.value) {
        workspaceName = row.value;
      }
    } catch (err) {
      console.error('Failed to get active workspace for user from DB:', err);
    }
    return path.join(getUserStorageRoot(username), workspaceName);
  }

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

export function setTargetDir(dir: string, username?: string): void {
  const normalized = path.resolve(dir);
  
  try {
    if (username) {
      const workspaceName = path.basename(normalized);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);").run(`active_workspace_path:${username}`, workspaceName);
      
      db.prepare(`
        INSERT INTO workspaces (path, name, user, last_opened) 
        VALUES (?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(path) DO UPDATE SET last_opened=strftime('%s', 'now');
      `).run(normalized, workspaceName, username);
    } else {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_workspace_path', ?);").run(normalized);
      
      const name = path.basename(normalized);
      db.prepare(`
        INSERT INTO workspaces (path, name, last_opened) 
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(path) DO UPDATE SET last_opened=strftime('%s', 'now');
      `).run(normalized, name);
    }
  } catch (err) {
    console.error('Failed to set active workspace in DB:', err);
    throw err;
  }
}

export function getRecentWorkspaces(username?: string): { path: string, name: string, last_opened: number }[] {
  try {
    if (username) {
      return db.prepare("SELECT path, name, last_opened FROM workspaces WHERE user = ? ORDER BY last_opened DESC LIMIT 10;").all(username) as any;
    } else {
      return db.prepare("SELECT path, name, last_opened FROM workspaces WHERE user IS NULL ORDER BY last_opened DESC LIMIT 10;").all() as any;
    }
  } catch (err) {
    console.error('Failed to get recent workspaces:', err);
    return [];
  }
}

export function getActiveWorkspaceId(req?: any): number | null {
  const activePath = getTargetDir(req);
  try {
    const row = db.prepare("SELECT id FROM workspaces WHERE path = ?;").get(activePath) as { id: number } | undefined;
    return row ? row.id : null;
  } catch (err) {
    console.error('Failed to get active workspace ID:', err);
    return null;
  }
}

export function getActiveWorkspaceName(req?: any): string {
  const activePath = getTargetDir(req);
  const username = req?.user;
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

export function selectWorkspaceByName(name: string, username?: string): string | null {
  try {
    let row;
    if (username) {
      row = db.prepare("SELECT path FROM workspaces WHERE name = ? AND user = ? COLLATE NOCASE;").get(name, username) as { path: string } | undefined;
    } else {
      row = db.prepare("SELECT path FROM workspaces WHERE name = ? AND user IS NULL COLLATE NOCASE;").get(name) as { path: string } | undefined;
    }
    if (row && row.path) {
      setTargetDir(row.path, username);
      return row.path;
    }
  } catch (err) {
    console.error('Failed to select workspace by name:', err);
  }
  return null;
}
