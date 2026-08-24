import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getTargetDir, setTargetDir, getRecentWorkspaces, getActiveWorkspaceId, getActiveWorkspaceName, selectWorkspaceByName, IGNORED_DIRS, getUserStorageRoot, getDirectorySize, getStorageDir } from './config.js';
import { getGitStatus, gitCommit, gitPush, gitPull, getGitBranch, cloneRepo, hasGitRemote, getGitAheadCount, getCommitDiff, gitShowHead } from './git.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { addIgnoredWord, getIgnoredWords, getAllApplicableIgnoredWords } from './dictionary.js';
import { isPathSafe, isWorkspacePathAllowed, isAllowedFileType } from './utils/pathSafety.js';
import { db, recordEvent, recordTokenUsage } from './db.js';
import { verifySessionToken, createSessionToken } from './utils/auth.js';
import { lint as markdownLint } from 'markdownlint/sync';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { mountUserVfs, unmountUserVfs } from './utils/vfs.js';

const app = express();

app.use(express.json());

function getGitHubClientId(): string {
  if (process.env.GITHUB_CLIENT_ID) return process.env.GITHUB_CLIENT_ID;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'github_client_id';").get() as { value: string } | undefined;
    return row?.value || '';
  } catch (err) {
    return '';
  }
}

function getGitHubClientSecret(): string {
  if (process.env.GITHUB_CLIENT_SECRET) return process.env.GITHUB_CLIENT_SECRET;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'github_client_secret';").get() as { value: string } | undefined;
    return row?.value || '';
  } catch (err) {
    return '';
  }
}

function getAllowedUser(): string {
  if (process.env.ALLOWED_USER) return process.env.ALLOWED_USER;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'allowed_user';").get() as { value: string } | undefined;
    return row?.value || '';
  } catch (err) {
    return '';
  }
}

function isUserAdmin(username: string | null | undefined): boolean {
  if (!username) return false;
  if (!isHostedModeActive()) return true;
  const allowed = getAllowedUser();
  const adminUsers = (process.env.ADMIN_USERS || 'plbogen,plbogen2')
    .split(',')
    .map(u => u.trim().toLowerCase())
    .filter(Boolean);
  if (allowed) {
    adminUsers.push(allowed.toLowerCase());
  }
  return adminUsers.includes(username.toLowerCase());
}

function isHostedModeActive(): boolean {
  if (getGitHubClientId()) return true;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'simulate_hosted_mode';").get() as { value: string } | undefined;
    return row?.value === 'true';
  } catch (err) {
    return false;
  }
}

function authMiddleware(req: any, res: any, next: any) {
  if (!isHostedModeActive()) {
    return next();
  }

  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c: string) => {
      const parts = c.trim().split('=');
      return [parts[0], parts.slice(1).join('=')];
    })
  );

  const sessionToken = cookies['session_token'];
  if (!sessionToken) {
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Session missing' });
  }

  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';
  const sessionData = verifySessionToken(sessionToken, secret);
  if (!sessionData) {
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
  }

  req.user = sessionData.username;
  if (req.user) {
    const vfsSecret = crypto.createHash('sha256').update(`${req.user}:${secret}`).digest('hex');
    mountUserVfs(req.user, vfsSecret).catch((err) => {
      console.warn(`Failed to auto-mount VFS for ${req.user}:`, err);
    });
  }

  let accessToken = sessionData.accessToken;
  if (!accessToken && req.user) {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(`github_access_token:${req.user}`) as { value: string } | undefined;
      if (row && row.value) {
        accessToken = row.value;
      }
    } catch (err) {
      // ignore
    }
  }
  req.accessToken = accessToken;
  next();
}

app.use((req: any, res: any, next: any) => {
  if (req.path.startsWith('/api/auth/') || req.path === '/api/health' || req.path.startsWith('/samples/')) {
    return next();
  }

  if (req.path === '/api/config') {
    if (req.method === 'GET') {
      return next();
    }
    if (isHostedModeActive() && getAllowedUser()) {
      return authMiddleware(req, res, next);
    }
    return next();
  }

  authMiddleware(req, res, next);
});

async function getFiles(dir: string, baseDir = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.includes(entry.name)) {
        return [];
      }
      return getFiles(res, baseDir);
    } else {
      if (entry.name.endsWith('.md')) {
        return path.relative(baseDir, res);
      }
      return [];
    }
  }));
  return Array.prototype.concat(...files).filter(Boolean) as string[];
}

const SERVER_BUILD_TIME = Date.now();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/version', async (req, res) => {
  try {
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    res.json({
      version: pkg.version,
      buildTime: SERVER_BUILD_TIME
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read package.json' });
  }
});

app.get('/api/changelog', async (req, res) => {
  try {
    const changelogPath = path.resolve(__dirname, '../../CHANGELOG.md');
    const content = await fs.readFile(changelogPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/files', async (req, res) => {
  try {
    const targetDir = getTargetDir(req);
    const files = await getFiles(targetDir);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/file', async (req, res) => {
  const filePath = req.query.path as string;
  const version = req.query.version as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }
  try {
    const targetDir = getTargetDir(req);
    const safePath = path.resolve(targetDir, filePath);
    if (!isPathSafe(safePath, targetDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user && !isAllowedFileType(safePath)) {
      return res.status(403).json({ error: 'Access denied: File type not supported for writing projects' });
    }

    if (version === 'HEAD') {
      const content = await gitShowHead(filePath, req);
      return res.json({ content });
    }

    const content = await fs.readFile(safePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/file', async (req, res) => {
  const { path: filePath, content } = req.body as { path: string, content: string };
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'Missing path or content' });
  }
  try {
    const targetDir = getTargetDir(req);
    const safePath = path.resolve(targetDir, filePath);
    if (!isPathSafe(safePath, targetDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user && !isAllowedFileType(safePath)) {
      return res.status(403).json({ error: 'Access denied: File type not supported for writing projects' });
    }
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/file', async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }
  try {
    const targetDir = getTargetDir(req);
    const safePath = path.resolve(targetDir, filePath);
    if (!isPathSafe(safePath, targetDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await fs.rm(safePath, { recursive: true, force: true });
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/git/status', async (req, res) => {
  try {
    const status = await getGitStatus(req);
    const hasRemote = await hasGitRemote(req);
    const ahead = await getGitAheadCount(req);
    let hasGemini = !!process.env.GEMINI_API_KEY;
    if (!hasGemini) {
      try {
        const key = req.user ? `gemini_api_key:${req.user}` : 'gemini_api_key';
        let row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
        if ((!row || !row.value) && req.user) {
          row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
        }
        hasGemini = !!(row && row.value);
      } catch (err) {
        // ignore
      }
    }
    res.json({ status, hasRemote, ahead, hasGemini });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/git/commit', async (req, res) => {
  const { message } = req.body as { message: string };
  if (!message) {
    return res.status(400).json({ error: 'Missing commit message' });
  }
  try {
    const result = await gitCommit(message, req);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/git/push', async (req, res) => {
  try {
    const result = await gitPush(req);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/git/pull', async (req, res) => {
  try {
    const result = await gitPull(req);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/git/branch', async (req, res) => {
  try {
    const branch = await getGitBranch(req);
    res.json({ branch });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/workspaces', async (req, res) => {
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

app.post('/api/workspaces/select', async (req, res) => {
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

app.post('/api/workspaces/select-by-name', async (req, res) => {
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

app.post('/api/workspaces/clone', async (req, res) => {
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

app.post('/api/workspaces/delete', async (req, res) => {
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

app.get('/api/github/repos', async (req: any, res: any) => {
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

app.get('/api/fs/list', async (req, res) => {
  const { path: queryPath } = req.query as { path?: string };
  const targetPath = queryPath 
    ? path.resolve(queryPath) 
    : (req.user ? getUserStorageRoot(req.user) : os.homedir());

  if (!isWorkspacePathAllowed(targetPath, req.user)) {
    return res.status(403).json({ error: 'Access denied: Directory path is outside allowed roots' });
  }

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    
    const directories = [];
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        directories.push({
          name: entry.name,
          path: path.join(targetPath, entry.name)
        });
      }
    }
    
    directories.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({ path: targetPath, directories });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/gemini/models', async (req, res) => {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const key = req.user ? `gemini_api_key:${req.user}` : 'gemini_api_key';
      const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
      if (row && row.value) {
        apiKey = row.value;
      } else if (req.user) {
        const globalRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
        if (globalRow && globalRow.value) {
          apiKey = globalRow.value;
        }
      }
    } catch (err) {
      // ignore
    }
  }

  if (!apiKey) {
    return res.json([
      { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
      { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
      { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
      { name: 'models/gemini-3.5-pro', displayName: 'Gemini 3.5 Pro' },
      { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest' },
      { name: 'models/gemini-pro-latest', displayName: 'Gemini Pro Latest' }
    ]);
  }

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models';
    const response = await fetch(url, {
      headers: {
        'x-goog-api-key': apiKey
      }
    });
    if (!response.ok) {
      throw new Error(`Google API returned status ${response.status}`);
    }
    const data = await response.json();
    const models = (data.models || [])
      .filter((m: any) => {
        const isSupported = m.supportedGenerationMethods?.includes('generateContent');
        const name = m.name || '';
        const stage = m.modelStage || '';

        // Exclude only officially legacy and deprecated models (keep experimental/previews)
        if (stage === 'LEGACY' || stage === 'DEPRECATED') {
          return false;
        }

        // Exclude non-text/embedding/image/veo/audio models
        if (
          name.includes('embedding') ||
          name.includes('imagen') ||
          name.includes('veo') ||
          name.includes('lyria') ||
          name.includes('robotics') ||
          name.includes('aqa') ||
          name.includes('banana') ||
          name.includes('nano') ||
          name.includes('gemma')
        ) {
          return false;
        }

        const isGeminiText = /gemini/i.test(name);
        return isSupported && isGeminiText;
      })
      .map((m: any) => ({
        name: m.name,
        displayName: m.displayName || m.name.replace('models/', '')
      }));
    res.json(models);
  } catch (err) {
    console.warn('Failed to fetch from live Gemini API, returning fallback list:', err);
    res.json([
      { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
      { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
      { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
      { name: 'models/gemini-3.5-pro', displayName: 'Gemini 3.5 Pro' },
      { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest' },
      { name: 'models/gemini-pro-latest', displayName: 'Gemini Pro Latest' }
    ]);
  }
});

app.get('/api/config', (req, res) => {
  try {
    const hasEnvKey = !!process.env.GEMINI_API_KEY;
    let hasDbKey = false;
    let simulateHostedMode = false;
    let geminiModel = 'gemini-1.5-flash';
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
      hasDbKey = !!(row && row.value);
    } catch (err) {
      // ignore
    }
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'simulate_hosted_mode';").get() as { value: string } | undefined;
      simulateHostedMode = row?.value === 'true';
    } catch (err) {
      // ignore
    }
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_model';").get() as { value: string } | undefined;
      if (row && row.value) {
        geminiModel = row.value;
      }
    } catch (err) {
      // ignore
    }

    res.json({ 
      hasGemini: hasEnvKey || hasDbKey,
      simulateHostedMode,
      githubClientId: getGitHubClientId(),
      hasGithubSecret: !!getGitHubClientSecret(),
      allowedUser: getAllowedUser(),
      geminiModel
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/config', async (req, res) => {
  const { 
    geminiApiKey, 
    simulateHostedMode, 
    githubClientId, 
    githubClientSecret, 
    allowedUser,
    geminiModel
  } = req.body as { 
    geminiApiKey?: string;
    simulateHostedMode?: boolean;
    githubClientId?: string;
    githubClientSecret?: string;
    allowedUser?: string;
    geminiModel?: string;
  };
  try {
    if (geminiApiKey !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_key', ?);").run(geminiApiKey);
    }
    if (simulateHostedMode !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('simulate_hosted_mode', ?);").run(simulateHostedMode ? 'true' : 'false');
    }
    if (githubClientId !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('github_client_id', ?);").run(githubClientId);
    }
    if (githubClientSecret !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('github_client_secret', ?);").run(githubClientSecret);
    }
    if (allowedUser !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_user', ?);").run(allowedUser);
    }
    if (geminiModel !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_model', ?);").run(geminiModel);
    }
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/git/diff', async (req, res) => {
  try {
    const diff = await getCommitDiff(req);
    res.json({ diff });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/git/suggest-commit-message', async (req, res) => {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
      if (row && row.value) {
        apiKey = row.value;
      }
    } catch (err) {
      console.error('Failed to read API key from DB:', err);
    }
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  try {
    const diff = await getCommitDiff(req);
    if (!diff || diff.trim().length === 0) {
      return res.json({ suggestion: '' });
    }

    let modelName = 'gemini-1.5-flash';
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_model';").get() as { value: string } | undefined;
      if (row && row.value) {
        modelName = row.value;
      }
    } catch (err) {
      // ignore
    }

    const cleanModelName = modelName.replace(/^models\//, '');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: cleanModelName });

    const prompt = `Write a concise, one-line git commit message summarizing these changes. Keep it under 72 characters, start with an imperative verb (e.g. Add, Fix, Update), and do not include any markdown formatting, backticks, or explanation. Here is the git diff:\n\n${diff}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    const cleanSuggestion = text
      .replace(/^[`"']|[`"']$/g, '')
      .replace(/^Commit message:\s*/i, '')
      .trim();

    res.json({ suggestion: cleanSuggestion });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

async function getMarkdownFilesRecursively(dir: string, targetDir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.resolve(dir, entry.name);
    if (!isPathSafe(fullPath, targetDir)) continue;
    if (entry.isDirectory()) {
      files.push(...(await getMarkdownFilesRecursively(fullPath, targetDir)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

app.post('/api/ai/analyze', async (req, res) => {
  const { path: filePath, persona, message, history, contextFiles, selectedText } = req.body as { 
    path: string; 
    persona: string;
    message?: string;
    history?: { role: 'user' | 'model', content: string }[];
    contextFiles?: string[];
    selectedText?: string;
  };
  if (!filePath || !persona) {
    return res.status(400).json({ error: 'Missing path or persona parameter' });
  }

  try {
    const targetDir = getTargetDir(req);
    const safePath = path.resolve(targetDir, filePath);
    if (!isPathSafe(safePath, targetDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try {
        const key = req.user ? `gemini_api_key:${req.user}` : 'gemini_api_key';
        const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
        if (row && row.value) {
          apiKey = row.value;
        } else if (req.user) {
          const globalRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
          if (globalRow && globalRow.value) {
            apiKey = globalRow.value;
          }
        }
      } catch (err) {
        // ignore
      }
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    let modelName = 'gemini-1.5-flash';
    try {
      const modelKey = req.user ? `gemini_model:${req.user}` : 'gemini_model';
      let row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(modelKey) as { value: string } | undefined;
      if ((!row || !row.value) && req.user) {
        row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_model';").get() as { value: string } | undefined;
      }
      if (row && row.value) {
        modelName = row.value;
      }
    } catch (err) {
      // ignore
    }

    const cleanModelName = modelName.replace(/^models\//, '');

    let systemInstruction = '';
    switch (persona) {
      case 'developmental':
        systemInstruction = 'You are a professional Developmental (or Structural) Editor. Analyze the chapter draft. Focus on big-picture elements like structural pacing, character arcs, plot progression, narrative tension, and general concept. Provide constructive feedback, highlighting what works and listing specific suggestions for structural revision. If additional background context files are provided, use them to check plot continuity and arc pacing, but focus your core feedback critique report on the primary draft.';
        break;
      case 'line':
        systemInstruction = 'You are a professional Line Editor. Analyze the chapter draft. Focus on sentence-level and paragraph-level polishing, style, tone, clarity, flow, vocabulary choices, and sentence variety. Highlight weak phrasing, passive voice, run-on sentences, or tonal inconsistencies, and suggest clear revisions.';
        break;
      case 'copy':
        systemInstruction = 'You are a professional Copy Editor. Analyze the chapter draft. Focus on technical accuracy, grammar, punctuation, spelling, syntax errors, and stylistic consistency. Call out specific grammatical errors and provide clear corrections.';
        break;
      case 'proofreader':
        systemInstruction = 'You are a professional Proofreader. Analyze the chapter draft. Perform a final pass on the text, checking for remaining typos, formatting bugs, missing punctuation, double spaces, and minor slip-ups. List the errors found and how to fix them.';
        break;
      case 'write-with-me':
        systemInstruction = 'You are a collaborative co-writing partner. Analyze the chapter draft so far. Engage in a dialogue with the writer. Do NOT write the text for them. Instead, analyze what has been written (including any inline comments they wrote to you) and suggest what the next sentence or detail should focus on, or ask a guiding question. Keep your response conversational, friendly, and brief (1-2 sentences). If additional context files (outlines, beatsheets, worldbuilding) are provided, use them to keep the story aligned.';
        break;
      default:
        return res.status(400).json({ error: `Invalid editor persona: ${persona}` });
    }

    systemInstruction += `

Format your response exactly like this:
1. Always start your response with a thinking block containing your step-by-step reasoning process (analyze pacing, tone, style, typos, etc.). Use this format:
<thinking>
[Detail your thinking process here]
</thinking>

2. Below the thinking block, write your final reader-facing markdown feedback review report.

3. If you suggest specific text edits, always provide them as separate search/replace blocks at the end of your response. Format each search/replace block precisely as:
<<<<
[Original lines from the chapter text that you want to replace]
====
[New replacement lines]
>>>>

Ensure the text in the original block matches the chapter draft EXACTLY, word-for-word, including punctuation and newlines. If you are not recommending text changes, do not write these blocks.

CRITICAL CONSTRAINT: You must only propose text replacements (using search/replace blocks) for the primary chapter draft you are reviewing. NEVER suggest edits targeting the background context files. You do not have permission to suggest modifications to context files.`;

    if (selectedText) {
      systemInstruction += `\n\nCRITICAL CONTEXT: The writer has highlighted/selected the following text in the chapter draft: "${selectedText}". Focus your feedback, suggestions, or replies on this selected text.`;
    }

    const fileContent = await fs.readFile(safePath, 'utf-8');
    const cleanContent = persona === 'write-with-me' ? fileContent : fileContent.replace(/<!--[\s\S]*?-->/g, '');
    if (!cleanContent.trim()) {
      return res.json({ feedback: 'This file is empty. Write some text before calling the AI Editor!' });
    }

    let contextString = '';
    if (contextFiles && contextFiles.length > 0) {
      contextString = '\n\nHere is additional context from other files in the workspace to assist your analysis:\n';
      for (const cFile of contextFiles) {
        const cSafePath = path.resolve(targetDir, cFile);
        if (!isPathSafe(cSafePath, targetDir)) {
          return res.status(403).json({ error: `Access denied for context file: ${cFile}` });
        }
        try {
          const stat = await fs.stat(cSafePath);
          if (stat.isDirectory()) {
            const allFiles = await getMarkdownFilesRecursively(cSafePath, targetDir);
            for (const subFile of allFiles) {
              const subContent = await fs.readFile(subFile, 'utf-8');
              const cleanSub = persona === 'write-with-me' ? subContent : subContent.replace(/<!--[\s\S]*?-->/g, '');
              if (cleanSub.trim().length > 0) {
                const relativePath = path.relative(targetDir, subFile);
                contextString += `\n--- Context File: ${relativePath} ---\n${cleanSub}\n`;
              }
            }
          } else {
            const cContent = await fs.readFile(cSafePath, 'utf-8');
            const cleanCContent = persona === 'write-with-me' ? cContent : cContent.replace(/<!--[\s\S]*?-->/g, '');
            if (cleanCContent.trim().length > 0) {
              contextString += `\n--- Context File: ${cFile} ---\n${cleanCContent}\n`;
            }
          }
        } catch (e) {
          console.warn(`Could not read context path ${cFile}`, e);
        }
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    if (history && history.length > 0) {
      const model = genAI.getGenerativeModel({ 
        model: cleanModelName,
        systemInstruction: systemInstruction + `\n\n--- CURRENT CHAPTER DRAFT ---\n${cleanContent}\n${contextString}`
      });
      const formattedHistory = history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }));
      const chat = model.startChat({ history: formattedHistory });
      const result = await chat.sendMessage(message || 'Suggest next');
      res.json({ feedback: result.response.text() });
    } else {
      const model = genAI.getGenerativeModel({ 
        model: cleanModelName,
        systemInstruction: systemInstruction
      });
      const prompt = `Please analyze this chapter draft:\n\n${cleanContent}${contextString}`;
      const result = await model.generateContent(prompt);
      res.json({ feedback: result.response.text() });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/ai/cache', async (req, res) => {
  const { path: filePath, persona } = req.query as { path?: string; persona?: string };
  if (!filePath || !persona) {
    return res.status(400).json({ error: 'Missing path or persona parameter' });
  }

  try {
    const workspaceName = path.basename(getTargetDir(req));
    const row = db.prepare(`
      SELECT messages_json FROM ai_feedback_cache 
      WHERE workspace_name = ? AND file_path = ? AND persona = ?;
    `).get(workspaceName, filePath, persona) as { messages_json: string } | undefined;

    if (row && row.messages_json) {
      return res.json({ messages: JSON.parse(row.messages_json) });
    }
    return res.json({ messages: [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/ai/cache', async (req, res) => {
  const { path: filePath, persona, messages } = req.body as { 
    path: string; 
    persona: string; 
    messages: any[] 
  };
  if (!filePath || !persona || !messages) {
    return res.status(400).json({ error: 'Missing path, persona, or messages parameter' });
  }

  try {
    const workspaceName = path.basename(getTargetDir(req));
    db.prepare(`
      INSERT OR REPLACE INTO ai_feedback_cache (workspace_name, file_path, persona, messages_json, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP);
    `).run(workspaceName, filePath, persona, JSON.stringify(messages));
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/dictionary/add', async (req, res) => {
  const { word, scope } = req.body as { word: string, scope: 'global' | 'workspace' };
  if (!word) {
    return res.status(400).json({ error: 'Missing word' });
  }
  if (scope !== 'global' && scope !== 'workspace') {
    return res.status(400).json({ error: 'Invalid scope, must be global or workspace' });
  }

  try {
    const workspacePath = scope === 'workspace' ? getTargetDir(req) : null;
    await addIgnoredWord(word, workspacePath, (req.user as string) || null);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/dictionary', async (req, res) => {
  try {
    const dictionary = await getIgnoredWords(getTargetDir(req), (req.user as string) || null);
    res.json(dictionary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/grammar/ignore', async (req, res) => {
  const { ruleId, scope } = req.body as { ruleId: string, scope: 'global' | 'workspace' };
  if (!ruleId) {
    return res.status(400).json({ error: 'Missing ruleId' });
  }
  if (scope !== 'global' && scope !== 'workspace') {
    return res.status(400).json({ error: 'Invalid scope, must be global or workspace' });
  }

  try {
    const workspaceId = scope === 'workspace' ? getActiveWorkspaceId() : null;
    const user = (req.user as string) || null;
    if (scope === 'global') {
      db.prepare(`
        INSERT OR IGNORE INTO ignored_rules (rule_id, workspace_id, user) VALUES (?, NULL, ?);
      `).run(ruleId, user);
    } else {
      db.prepare(`
        INSERT OR IGNORE INTO ignored_rules (rule_id, workspace_id, user) VALUES (?, ?, ?);
      `).run(ruleId, workspaceId, user);
    }
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/grammar/ignored', async (req, res) => {
  try {
    const workspaceId = getActiveWorkspaceId();
    const user = (req.user as string) || null;
    let rows: { rule_id: string, workspace_id: number | null }[] = [];
    if (user) {
      rows = db.prepare(`
        SELECT rule_id, workspace_id FROM ignored_rules 
        WHERE (workspace_id IS NULL AND (user = ? OR user IS NULL))
           OR (workspace_id = ?);
      `).all(user, workspaceId) as { rule_id: string, workspace_id: number | null }[];
    } else {
      rows = db.prepare(`
        SELECT rule_id, workspace_id FROM ignored_rules 
        WHERE (workspace_id IS NULL AND user IS NULL)
           OR (workspace_id = ?);
      `).all(workspaceId) as { rule_id: string, workspace_id: number | null }[];
    }

    const result = {
      global: rows.filter(r => r.workspace_id === null).map(r => r.rule_id),
      workspace: rows.filter(r => r.workspace_id !== null).map(r => r.rule_id)
    };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/grammar/ignore-instance', async (req, res) => {
  const { ruleId, sentence, filePath } = req.body as { 
    ruleId: string; 
    sentence: string; 
    filePath: string; 
  };
  if (!ruleId || !sentence || !filePath) {
    return res.status(400).json({ error: 'Missing ruleId, sentence, or filePath parameter' });
  }

  try {
    const workspaceId = getActiveWorkspaceId();
    if (!workspaceId) {
      return res.status(400).json({ error: 'No active workspace selected' });
    }
    const cleanSentence = sentence.trim();
    const hash = crypto.createHash('md5').update(cleanSentence).digest('hex');
    const user = (req.user as string) || null;

    db.prepare(`
      INSERT OR IGNORE INTO ignored_instances (file_path, workspace_id, rule_id, context_hash, user)
      VALUES (?, ?, ?, ?, ?);
    `).run(filePath, workspaceId, ruleId, hash, user);

    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/languagetool/check', async (req, res) => {
  const { text, filePath } = req.body as { text: string; filePath?: string };
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  try {
    const normalizedText = text.replace(/\r\n/g, '\n');
    const cleanText = normalizedText.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));
    const paragraphs: { text: string; start: number }[] = [];
    const parts = cleanText.split('\n\n');
    let currentOffset = 0;
    for (const part of parts) {
      paragraphs.push({ text: part, start: currentOffset });
      currentOffset += part.length + 2;
    }

    const nonEvParagraphs = paragraphs.filter(p => p.text.trim().length > 0);
    const hashes = nonEvParagraphs.map(p => crypto.createHash('md5').update(p.text).digest('hex'));

    const cacheMap = new Map<string, any[]>();
    if (hashes.length > 0) {
      try {
        const placeholders = hashes.map(() => '?').join(',');
        const rows = db.prepare(`SELECT hash, matches FROM languagetool_cache WHERE hash IN (${placeholders});`).all(...hashes) as { hash: string; matches: string }[];
        for (const row of rows) {
          cacheMap.set(row.hash, JSON.parse(row.matches));
        }
      } catch (err) {
        console.warn('Failed to query languagetool_cache in batch:', err);
      }
    }

    const checkPromises = paragraphs.map(async (p) => {
      if (!p.text.trim()) return [];

      const hash = crypto.createHash('md5').update(p.text).digest('hex');
      let rawMatches = cacheMap.get(hash) || null;

      if (!rawMatches) {
        const params = new URLSearchParams();
        params.append('text', p.text);
        params.append('language', 'en-US');

        const ltRes = await fetch('https://api.languagetool.org/v2/check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: params
        });

        if (!ltRes.ok) {
          throw new Error(`LanguageTool API returned status ${ltRes.status}`);
        }

        const data = (await ltRes.json()) as { matches: any[] };
        rawMatches = data.matches || [];

        try {
          db.prepare("INSERT OR REPLACE INTO languagetool_cache (hash, matches) VALUES (?, ?);").run(hash, JSON.stringify(rawMatches));
        } catch (err) {
          console.warn('Failed to insert into languagetool_cache:', err);
        }
      }

      return rawMatches.map((m: any) => ({
        ...m,
        offset: m.offset + p.start
      }));
    });

    const results = await Promise.all(checkPromises);
    const allMatches = results.flat();

    const user = (req.user as string) || null;
    const ignoredWords = await getAllApplicableIgnoredWords(getTargetDir(req), user);

    const workspaceId = getActiveWorkspaceId();
    let ignoredRulesRows: { rule_id: string }[] = [];
    if (user) {
      ignoredRulesRows = db.prepare(`
        SELECT rule_id FROM ignored_rules 
        WHERE (workspace_id IS NULL AND (user = ? OR user IS NULL))
           OR (workspace_id = ?);
      `).all(user, workspaceId) as { rule_id: string }[];
    } else {
      ignoredRulesRows = db.prepare(`
        SELECT rule_id FROM ignored_rules 
        WHERE (workspace_id IS NULL AND user IS NULL)
           OR (workspace_id = ?);
      `).all(workspaceId) as { rule_id: string }[];
    }
    const ignoredRules = new Set(ignoredRulesRows.map(r => r.rule_id));

    let ignoredInstances = new Set<string>();
    if (filePath && workspaceId) {
      let instanceRows: { rule_id: string, context_hash: string }[] = [];
      if (user) {
        instanceRows = db.prepare(`
          SELECT rule_id, context_hash FROM ignored_instances
          WHERE file_path = ? AND workspace_id = ? AND (user = ? OR user IS NULL);
        `).all(filePath, workspaceId, user) as { rule_id: string, context_hash: string }[];
      } else {
        instanceRows = db.prepare(`
          SELECT rule_id, context_hash FROM ignored_instances
          WHERE file_path = ? AND workspace_id = ?;
        `).all(filePath, workspaceId) as { rule_id: string, context_hash: string }[];
      }
      ignoredInstances = new Set(instanceRows.map(r => `${r.rule_id}:${r.context_hash}`));
    }

    const filteredMatches = allMatches.filter((match) => {
      // 1. Filter out ignored grammar rule IDs
      if (match.rule?.id && ignoredRules.has(match.rule.id)) {
        return false;
      }

      // 2. Filter out ignored grammar instances
      if (match.rule?.id && match.sentence) {
        const cleanSentence = match.sentence.trim();
        const contextHash = crypto.createHash('md5').update(cleanSentence).digest('hex');
        if (ignoredInstances.has(`${match.rule.id}:${contextHash}`)) {
          return false;
        }
      }

      // 3. Filter out spelling ignored words
      const isSpelling = match.rule?.issueType === 'misspelling';
      if (!isSpelling) return true;

      const misspelledWord = normalizedText.substring(match.offset, match.offset + match.length).trim().toLowerCase();
      return !ignoredWords.has(misspelledWord);
    });

    res.json({ matches: filteredMatches });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/markdown/lint', (req, res) => {
  const { text } = req.body as { text: string };
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  try {
    const results = markdownLint({
      strings: {
        doc: text
      },
      config: {
        "default": true,
        "MD013": false,
        "MD033": false
      }
    });

    const violations = results.doc || [];
    res.json({ violations });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* Authentication & OAuth Routes */
app.get('/api/auth/login', (req, res) => {
  if (!isHostedModeActive()) {
    return res.redirect('/');
  }

  const clientId = getGitHubClientId();
  if (!clientId) {
    // Simulated mode bypass: immediately redirect to callback
    return res.redirect('/api/auth/github/callback?code=mock_dev_code');
  }

  const host = req.get('host');
  const protocol = req.protocol || 'http';
  const defaultBase = `${protocol}://${host}`;
  const redirectUri = `${process.env.BASE_URL || defaultBase}/api/auth/github/callback`;
  const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,read:user&prompt=consent`;
  res.redirect(authorizeUrl);
});

app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query as { code: string };
  if (!code) {
    return res.status(400).send('OAuth callback code missing');
  }

  const clientId = getGitHubClientId();
  const clientSecret = getGitHubClientSecret();
  const allowed = getAllowedUser();
  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';

  try {
    let githubUser = '';
    let accessToken: string | undefined;
    if (!clientId) {
      // Mock bypass
      const simulateRow = db.prepare("SELECT value FROM settings WHERE key = 'simulate_hosted_mode';").get() as { value: string } | undefined;
      if (simulateRow?.value === 'true') {
        githubUser = allowed || 'dev_mock_user';
      } else {
        throw new Error('OAuth Client ID is not configured');
      }
    } else {
      const host = req.get('host');
      const protocol = req.protocol || 'http';
      const defaultBase = `${protocol}://${host}`;
      const redirectUri = `${process.env.BASE_URL || defaultBase}/api/auth/github/callback`;

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      });
      
      const tokenData = await tokenRes.json() as { access_token?: string, error?: string, error_description?: string };
      if (tokenData.error || !tokenData.access_token) {
        console.error('GitHub OAuth token exchange error:', tokenData);
        throw new Error(tokenData.error_description || tokenData.error || 'Failed to retrieve access token');
      }

      accessToken = tokenData.access_token;

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': 'marginalia-app'
        }
      });
      const userData = await userRes.json() as { login: string };
      githubUser = userData.login;
    }

    if (!githubUser) {
      throw new Error('Failed to retrieve GitHub profile info');
    }

    if (allowed && githubUser.toLowerCase() !== allowed.toLowerCase()) {
      return res.status(403).send(`Access Denied: User ${githubUser} is not whitelisted`);
    }

    if (accessToken) {
      try {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);").run(`github_access_token:${githubUser}`, accessToken);
      } catch (err) {
        console.warn('Failed to save github_access_token to DB:', err);
      }
    }

    const vfsSecret = crypto.createHash('sha256').update(`${githubUser}:${secret}`).digest('hex');
    await mountUserVfs(githubUser, vfsSecret);

    const sessionToken = createSessionToken(githubUser, secret, accessToken);
    const isSecureReq = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
    res.setHeader('Set-Cookie', `session_token=${sessionToken}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}; ${isSecureReq ? 'Secure;' : ''} SameSite=Lax`);

    const frontendUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '/';
    res.redirect(frontendUrl);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    res.status(500).send(`OAuth Authentication failed: ${(err as Error).message}`);
  }
});

app.get('/api/auth/status', (req, res) => {
  if (!isHostedModeActive()) {
    return res.json({ loggedIn: true, user: 'local', isOAuthMode: false, isAdmin: true });
  }

  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c: string) => {
      const parts = c.trim().split('=');
      return [parts[0], parts.slice(1).join('=')];
    })
  );
  const sessionToken = cookies['session_token'];
  if (!sessionToken) {
    return res.json({ loggedIn: false, user: null, isOAuthMode: true, isAdmin: false });
  }

  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';
  const sessionData = verifySessionToken(sessionToken, secret);
  if (!sessionData) {
    return res.json({ loggedIn: false, user: null, isOAuthMode: true, isAdmin: false });
  }

  const isAdmin = isUserAdmin(sessionData.username);
  res.json({ loggedIn: true, user: sessionData.username, isOAuthMode: true, isAdmin });
});

app.post('/api/auth/logout', async (req: any, res: any) => {
  if (req.user) {
    await unmountUserVfs(req.user);
  }
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.json({ status: 'ok' });
});

// --- PARLANDO NEURAL TTS PROXY ROUTES ---
const PARLANDO_URL = process.env.PARLANDO_URL || 'http://localhost:8765';

app.get('/api/tts/voices', async (req: any, res: any) => {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const key = req.user ? `gemini_api_key:${req.user}` : 'gemini_api_key';
      const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
      if (row && row.value) {
        apiKey = row.value;
      } else if (req.user) {
        const globalRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
        if (globalRow && globalRow.value) {
          apiKey = globalRow.value;
        }
      }
    } catch (err) {
      // ignore
    }
  }

  try {
    const response = await fetch(`${PARLANDO_URL}/api/voices`);
    if (!response.ok) throw new Error('Parlando API unavailable');
    const data = await response.json();
    res.json({ ...data, has_gemini_key: !!apiKey, available: true });
  } catch (err) {
    res.json({
      voices: [
        'Fenrir',
        'Puck',
        'Charon',
        'Aoede',
        'Kore',
        'en-US-ChristopherNeural',
        'en-US-GuyNeural',
        'en-US-JennyNeural',
        'en-US-AriaNeural',
        'en-GB-RyanNeural',
        'en-GB-SoniaNeural',
      ],
      profiles: ['cyberpunk_noir', 'space_opera', 'classic_fiction'],
      pacing: ['normal', 'brisk', 'dramatic', 'cinematic', 'contemplative'],
      has_gemini_key: !!apiKey,
      available: false,
    });
  }
});

app.post('/api/tts/synthesize', async (req: any, res: any) => {
  const { text, voice, pacing, speed, backend } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text content' });
  }

  // Resolve user-configured or environment Gemini API key
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const key = req.user ? `gemini_api_key:${req.user}` : 'gemini_api_key';
      const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
      if (row && row.value) {
        apiKey = row.value;
      } else if (req.user) {
        const globalRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
        if (globalRow && globalRow.value) {
          apiKey = globalRow.value;
        }
      }
    } catch (err) {
      // ignore
    }
  }

  const selectedBackend = backend || (apiKey ? 'gemini' : 'edge');
  const defaultVoice = selectedBackend === 'gemini' ? 'Fenrir' : 'en-US-ChristopherNeural';

  try {
    recordEvent(req.user, 'synthesize', 'tts_narration', { length: text.length, voice, pacing, backend: selectedBackend });
    let response = await fetch(`${PARLANDO_URL}/api/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: voice || defaultVoice,
        pacing: pacing || 'normal',
        speed: speed || 1.0,
        backend: selectedBackend,
        gemini_api_key: apiKey || undefined,
        api_key: apiKey || undefined,
      }),
    });

    // Fallback to edge engine if Gemini synthesis encounters an issue
    if (!response.ok && selectedBackend === 'gemini') {
      const geminiToEdgeMap: Record<string, string> = {
        'Fenrir': 'en-US-ChristopherNeural',
        'Puck': 'en-US-GuyNeural',
        'Charon': 'en-GB-RyanNeural',
        'Aoede': 'en-US-JennyNeural',
        'Kore': 'en-US-AriaNeural',
        'Leda': 'en-GB-SoniaNeural',
        'Oran': 'en-US-EricNeural',
        'Zephyr': 'en-US-RogerNeural',
      };
      const fallbackVoice = geminiToEdgeMap[voice] || 'en-US-ChristopherNeural';
      console.warn(`Gemini TTS synthesis failed, falling back to EdgeTTS (${fallbackVoice})...`);
      response = await fetch(`${PARLANDO_URL}/api/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: fallbackVoice,
          pacing: pacing || 'normal',
          speed: speed || 1.0,
          backend: 'edge',
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Parlando error: ${errText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Parlando synthesis failed:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- ADMIN TELEMETRY & FEATURE USAGE MONITOR ---
app.get('/api/admin/metrics', async (req: any, res: any) => {
  if (!isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Forbidden: Admin metrics are strictly restricted to administrator logins (e.g. plbogen)' });
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const dayAgoSec = nowSec - 86400;
    const weekAgoSec = nowSec - 7 * 86400;
    const monthAgoSec = nowSec - 30 * 86400;

    // Users
    const totalUsersRow = db.prepare("SELECT COUNT(DISTINCT user) as count FROM workspaces WHERE user IS NOT NULL AND user != 'anonymous';").get() as any;
    const totalUsers = totalUsersRow?.count || 0;

    const activeUsers24hRow = db.prepare("SELECT COUNT(DISTINCT user) as count FROM analytics_events WHERE created_at >= ? AND user != 'anonymous';").get(dayAgoSec) as any;
    const activeUsers7dRow = db.prepare("SELECT COUNT(DISTINCT user) as count FROM analytics_events WHERE created_at >= ? AND user != 'anonymous';").get(weekAgoSec) as any;

    // Storage
    let totalStorageBytes = 0;
    const userStorageBreakdown: { user: string; sizeBytes: number }[] = [];
    const storageRoot = getStorageDir();
    try {
      if (existsSync(storageRoot)) {
        const userDirs = await fs.readdir(storageRoot, { withFileTypes: true });
        for (const u of userDirs) {
          if (u.isDirectory()) {
            const userPath = path.join(storageRoot, u.name);
            const size = await getDirectorySize(userPath);
            totalStorageBytes += size;
            userStorageBreakdown.push({ user: u.name, sizeBytes: size });
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // AI Token Usage
    const tokenTotals = db.prepare(`
      SELECT 
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens
      FROM ai_token_usage;
    `).get() as any;

    const tokensByFeature = db.prepare(`
      SELECT feature, SUM(total_tokens) as total_tokens, COUNT(*) as count
      FROM ai_token_usage
      GROUP BY feature
      ORDER BY total_tokens DESC;
    `).all() as any[];

    const tokensByModel = db.prepare(`
      SELECT model, SUM(total_tokens) as total_tokens, COUNT(*) as count
      FROM ai_token_usage
      GROUP BY model
      ORDER BY total_tokens DESC;
    `).all() as any[];

    const tokensTimeSeries = db.prepare(`
      SELECT date(created_at, 'unixepoch') as date, SUM(total_tokens) as total_tokens, COUNT(*) as count
      FROM ai_token_usage
      WHERE created_at >= ?
      GROUP BY date(created_at, 'unixepoch')
      ORDER BY date ASC;
    `).all(monthAgoSec) as any[];

    // Feature Events
    const featureEvents = db.prepare(`
      SELECT feature, COUNT(*) as count
      FROM analytics_events
      GROUP BY feature
      ORDER BY count DESC;
    `).all() as any[];

    const recentEvents = db.prepare(`
      SELECT id, user, event_type, feature, metadata, created_at
      FROM analytics_events
      ORDER BY created_at DESC
      LIMIT 50;
    `).all() as any[];

    res.json({
      overview: {
        totalUsers,
        activeUsers24h: activeUsers24hRow?.count || 0,
        activeUsers7d: activeUsers7dRow?.count || 0,
        totalStorageBytes,
        totalTokens: tokenTotals?.total_tokens || 0,
        promptTokens: tokenTotals?.prompt_tokens || 0,
        completionTokens: tokenTotals?.completion_tokens || 0,
      },
      userStorage: userStorageBreakdown,
      aiUsage: {
        byFeature: tokensByFeature,
        byModel: tokensByModel,
        timeSeries: tokensTimeSeries,
      },
      features: featureEvents,
      recentActivity: recentEvents,
    });
  } catch (err) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

import { existsSync } from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

export { app };
