import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getTargetDir, setTargetDir, getRecentWorkspaces, getActiveWorkspaceId, getActiveWorkspaceName, selectWorkspaceByName, IGNORED_DIRS, getUserStorageRoot } from './config.js';
import { getGitStatus, gitCommit, gitPush, gitPull, getGitBranch, cloneRepo, hasGitRemote, getGitAheadCount, getCommitDiff } from './git.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { addIgnoredWord, getIgnoredWords, getAllApplicableIgnoredWords } from './dictionary.js';
import { isPathSafe, isWorkspacePathAllowed } from './utils/pathSafety.js';
import { db } from './db.js';
import { verifySessionToken, createSessionToken } from './utils/auth.js';

const app = express();

app.use(express.json());

function authMiddleware(req: any, res: any, next: any) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
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
      return res.redirect('/api/auth/login');
    }
    return res.status(401).json({ error: 'Unauthorized: Session missing' });
  }

  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';
  const username = verifySessionToken(sessionToken, secret);
  if (!username) {
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect('/api/auth/login');
    }
    return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
  }

  req.user = username;
  next();
}

app.use((req: any, res: any, next: any) => {
  if (req.path.startsWith('/api/auth/') || req.path === '/api/health') {
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
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
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }
  try {
    const targetDir = getTargetDir(req);
    const safePath = path.resolve(targetDir, filePath);
    if (!isPathSafe(safePath, targetDir)) {
      return res.status(403).json({ error: 'Access denied' });
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

app.get('/api/workspaces', (req, res) => {
  try {
    const active = getTargetDir(req);
    const activeName = getActiveWorkspaceName(req);
    const recents = getRecentWorkspaces(req.user);
    res.json({ active, activeName, recents });
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
  const { url, path: targetPath } = req.body as { url: string, path: string };
  if (!url || !targetPath) {
    return res.status(400).json({ error: 'Missing url or path' });
  }
  try {
    const resolvedPath = path.resolve(targetPath);
    if (!isWorkspacePathAllowed(resolvedPath, req.user)) {
      return res.status(403).json({ error: 'Access denied: Workspace path is outside allowed roots' });
    }
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    
    const result = await cloneRepo(url, resolvedPath);
    setTargetDir(resolvedPath, req.user);
    res.json({ status: 'ok', result: `Cloned successfully.\n${result}`, path: resolvedPath, name: getActiveWorkspaceName(req) });
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

app.get('/api/config', (req, res) => {
  try {
    const hasEnvKey = !!process.env.GEMINI_API_KEY;
    let hasDbKey = false;
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
      hasDbKey = !!(row && row.value);
    } catch (err) {
      // ignore
    }
    res.json({ hasGemini: hasEnvKey || hasDbKey });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/config', async (req, res) => {
  const { geminiApiKey } = req.body as { geminiApiKey: string };
  if (geminiApiKey === undefined) {
    return res.status(400).json({ error: 'Missing geminiApiKey' });
  }
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_key', ?);").run(geminiApiKey);
    res.json({ status: 'ok' });
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
    const diff = await getCommitDiff();
    if (!diff || diff.trim().length === 0) {
      return res.json({ suggestion: '' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
    await addIgnoredWord(word, workspacePath);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/dictionary', async (req, res) => {
  try {
    const dictionary = await getIgnoredWords(getTargetDir(req));
    res.json(dictionary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/languagetool/check', async (req, res) => {
  const { text } = req.body as { text: string };
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  try {
    const params = new URLSearchParams();
    params.append('text', text);
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
    const matches = data.matches || [];

    const ignoredWords = await getAllApplicableIgnoredWords(getTargetDir(req));

    const filteredMatches = matches.filter((match) => {
      const isSpelling = match.rule?.issueType === 'misspelling';
      if (!isSpelling) return true;

      const misspelledWord = text.substring(match.offset, match.offset + match.length).trim().toLowerCase();
      return !ignoredWords.has(misspelledWord);
    });

    res.json({ matches: filteredMatches });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* Authentication & OAuth Routes */
app.get('/api/auth/login', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.redirect('/');
  }
  const redirectUri = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/github/callback`;
  const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
  res.redirect(authorizeUrl);
});

app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query as { code: string };
  if (!code) {
    return res.status(400).send('OAuth callback code missing');
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const allowed = process.env.ALLOWED_USER || '';
  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });
    
    const tokenData = await tokenRes.json() as { access_token?: string, error?: string };
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error || 'Failed to retrieve access token');
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${tokenData.access_token}`,
        'User-Agent': 'marginalia-app'
      }
    });
    const userData = await userRes.json() as { login: string };
    const githubUser = userData.login;

    if (!githubUser) {
      throw new Error('Failed to retrieve GitHub profile info');
    }

    if (githubUser.toLowerCase() !== allowed.toLowerCase()) {
      return res.status(403).send(`Access Denied: User ${githubUser} is not whitelisted`);
    }

    await fs.mkdir(getUserStorageRoot(githubUser), { recursive: true });

    const sessionToken = createSessionToken(githubUser, secret);

    res.setHeader('Set-Cookie', `session_token=${sessionToken}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`);

    const frontendUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '/';
    res.redirect(frontendUrl);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    res.status(500).send(`OAuth Authentication failed: ${(err as Error).message}`);
  }
});

app.get('/api/auth/status', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.json({ loggedIn: true, user: 'local', isOAuthMode: false });
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
    return res.json({ loggedIn: false, user: null, isOAuthMode: true });
  }

  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';
  const username = verifySessionToken(sessionToken, secret);
  if (!username) {
    return res.json({ loggedIn: false, user: null, isOAuthMode: true });
  }

  res.json({ loggedIn: true, user: username, isOAuthMode: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.json({ status: 'ok' });
});

export { app };
