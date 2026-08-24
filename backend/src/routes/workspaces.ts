import { Router, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { db } from '../db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getTargetDir,
  setTargetDir,
  getRecentWorkspaces,
  getActiveWorkspaceName,
  selectWorkspaceByName,
  getUserStorageRoot,
  getDirectorySize,
} from '../config.js';
import { isWorkspacePathAllowed } from '../utils/pathSafety.js';
import { cloneRepo } from '../git.js';

export const workspacesRouter = Router();

workspacesRouter.get('/api/workspaces', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const active = getTargetDir(req);
    const activeName = getActiveWorkspaceName(req);
    const recents = getRecentWorkspaces(req.user);
    
    let storageUsage = null;
    if (req.user) {
      const userStorage = getUserStorageRoot(req.user);
      const usedBytes = await getDirectorySize(userStorage);
      const limitMB = parseInt(process.env.MAX_USER_STORAGE_MB || '100', 10);
      storageUsage = {
        usedMB: Math.round((usedBytes / (1024 * 1024)) * 10) / 10,
        limitMB
      };
    }

    res.json({ active, activeName, recents, storageUsage });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

workspacesRouter.post('/api/workspaces/select', async (req: AuthenticatedRequest, res: Response) => {
  const { path: targetPath } = req.body as { path: string };
  if (!targetPath) {
    return res.status(400).json({ error: 'Missing path' });
  }
  try {
    const resolvedPath = path.resolve(targetPath);
    if (!isWorkspacePathAllowed(resolvedPath, req.user)) {
      return res.status(403).json({ error: 'Access denied: Workspace path is outside allowed roots' });
    }
    await fs.access(resolvedPath);
    await fs.access(path.join(resolvedPath, '.git'));
    
    setTargetDir(resolvedPath, req.user);
    res.json({ status: 'ok', path: resolvedPath, name: getActiveWorkspaceName(req) });
  } catch (err) {
    res.status(400).json({ error: `Invalid workspace path: ${(err as Error).message}` });
  }
});

workspacesRouter.post('/api/workspaces/select-by-name', async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body as { name: string };
  if (!name) {
    return res.status(400).json({ error: 'Missing name' });
  }
  try {
    const resolvedPath = selectWorkspaceByName(name, req.user);
    if (resolvedPath) {
      res.json({ status: 'ok', path: resolvedPath, name });
    } else {
      res.status(404).json({ error: `Workspace not found: ${name}` });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

workspacesRouter.post('/api/workspaces/clone', async (req: AuthenticatedRequest, res: Response) => {
  const { url, path: inputPath } = req.body as { url: string, path?: string };
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'Missing url' });
  }
  if (url.trim().startsWith('-') || /\s/.test(url)) {
    return res.status(400).json({ error: 'Invalid clone URL format' });
  }
  try {
    let targetPath = inputPath ? inputPath.trim() : '';
    if (!targetPath) {
      const match = url.match(/\/([^/]+?)(?:\.git)?$/);
      const repoName = match ? match[1] : 'repository';
      const userStorage = req.user ? getUserStorageRoot(req.user) : path.join(os.homedir(), 'github');
      targetPath = path.join(userStorage, repoName);
    }

    const resolvedPath = path.resolve(targetPath);
    if (!isWorkspacePathAllowed(resolvedPath, req.user)) {
      return res.status(403).json({ error: 'Access denied: Workspace path is outside allowed roots' });
    }

    // If repository is already cloned on disk, open it immediately
    try {
      await fs.access(path.join(resolvedPath, '.git'));
      setTargetDir(resolvedPath, req.user);
      return res.json({ status: 'ok', result: 'Workspace already exists on disk and is now open.', path: resolvedPath, name: getActiveWorkspaceName(req) });
    } catch {
      // Not cloned yet, proceed to check storage limits
    }

    if (req.user) {
      const userStorage = getUserStorageRoot(req.user);
      const usedBytes = await getDirectorySize(userStorage);
      const limitMB = parseInt(process.env.MAX_USER_STORAGE_MB || '100', 10);
      const limitBytes = limitMB * 1024 * 1024;
      if (usedBytes >= limitBytes) {
        const usedMB = (usedBytes / (1024 * 1024)).toFixed(1);
        return res.status(403).json({ error: `Storage limit exceeded (${usedMB} MB / ${limitMB} MB used). Please delete unused cloned workspaces before cloning new repositories.` });
      }
    }

    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    
    const result = await cloneRepo(url, resolvedPath, req.accessToken);
    setTargetDir(resolvedPath, req.user);
    res.json({ status: 'ok', result: `Cloned successfully.\n${result}`, path: resolvedPath, name: getActiveWorkspaceName(req) });
  } catch (err) {
    const errMsg = (err as Error).message || '';
    if (errMsg.includes('could not read Username') || errMsg.includes('Authentication failed')) {
      return res.status(401).json({ error: 'Authentication required to clone private repository. Please sign out and sign back in via GitHub to grant repository access.' });
    }
    res.status(500).json({ error: errMsg });
  }
});

workspacesRouter.post('/api/workspaces/delete', async (req: AuthenticatedRequest, res: Response) => {
  const { path: targetPath } = req.body as { path: string };
  if (!targetPath) {
    return res.status(400).json({ error: 'Missing path' });
  }

  try {
    const userStorage = req.user ? getUserStorageRoot(req.user) : os.homedir();
    let resolvedPath = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(userStorage, targetPath);

    if (req.user && !resolvedPath.startsWith(path.resolve(userStorage))) {
      resolvedPath = path.resolve(userStorage, path.basename(targetPath));
    }

    if (!isWorkspacePathAllowed(resolvedPath, req.user)) {
      return res.status(403).json({ error: 'Access denied: Cannot delete workspace outside your allowed root' });
    }

    if (resolvedPath === path.resolve(userStorage) || resolvedPath === path.resolve(os.homedir())) {
      return res.status(400).json({ error: 'Cannot delete storage root directory' });
    }

    await fs.rm(resolvedPath, { recursive: true, force: true });

    const workspaceName = path.basename(resolvedPath);
    if (req.user) {
      db.prepare("DELETE FROM workspaces WHERE path = ?;").run(resolvedPath);
      const activeRow = db.prepare("SELECT value FROM settings WHERE key = ?;").get(`active_workspace_path:${req.user}`) as { value: string } | undefined;
      if (activeRow?.value === workspaceName) {
        db.prepare("DELETE FROM settings WHERE key = ?;").run(`active_workspace_path:${req.user}`);
      }

    } else {
      db.prepare("DELETE FROM workspaces WHERE path = ?;").run(resolvedPath);
      const activeRow = db.prepare("SELECT value FROM settings WHERE key = 'active_workspace_path';").get() as { value: string } | undefined;
      if (activeRow?.value === resolvedPath) {
        db.prepare("DELETE FROM settings WHERE key = 'active_workspace_path';").run();
      }
    }

    res.json({ status: 'ok', message: `Deleted workspace ${workspaceName}` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

workspacesRouter.get('/api/github/repos', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accessToken = req.accessToken;
    let repos: any[] = [];
    if (accessToken) {
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 5) {
        const repoRes = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'marginalia-app'
          }
        });
        if (repoRes.ok) {
          const pageRepos = await repoRes.json();
          if (Array.isArray(pageRepos) && pageRepos.length > 0) {
            repos.push(...pageRepos);
            if (pageRepos.length < 100) hasMore = false;
          } else {
            hasMore = false;
          }
        } else {
          const errText = await repoRes.text();
          console.error(`GitHub /user/repos page ${page} failed:`, repoRes.status, errText);
          hasMore = false;
        }
        page++;
      }
    } else if (req.user) {
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 5) {
        const repoRes = await fetch(`https://api.github.com/users/${req.user}/repos?per_page=100&page=${page}&sort=updated`, {
          headers: {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'marginalia-app'
          }
        });
        if (repoRes.ok) {
          const pageRepos = await repoRes.json();
          if (Array.isArray(pageRepos) && pageRepos.length > 0) {
            repos.push(...pageRepos);
            if (pageRepos.length < 100) hasMore = false;
          } else {
            hasMore = false;
          }
        } else {
          const errText = await repoRes.text();
          console.error(`GitHub /users/:user/repos page ${page} failed:`, repoRes.status, errText);
          hasMore = false;
        }
        page++;
      }
    }
    const formatted = (Array.isArray(repos) ? repos : []).map((r: any) => ({
      name: r.name,
      full_name: r.full_name,
      clone_url: r.clone_url,
      ssh_url: r.ssh_url,
      html_url: r.html_url,
      description: r.description,
      is_private: r.private,
      pushed_at: r.pushed_at || r.updated_at || ''
    }));
    res.json({ repos: formatted });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
