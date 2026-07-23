import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getTargetDir, setTargetDir, getRecentWorkspaces, getActiveWorkspaceId, getActiveWorkspaceName, selectWorkspaceByName, IGNORED_DIRS, getUserStorageRoot } from './config.js';
import { getGitStatus, gitCommit, gitPush, gitPull, getGitBranch, cloneRepo, hasGitRemote, getGitAheadCount, getCommitDiff, gitShowHead } from './git.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { addIgnoredWord, getIgnoredWords, getAllApplicableIgnoredWords } from './dictionary.js';
import { isPathSafe, isWorkspacePathAllowed } from './utils/pathSafety.js';
import { db } from './db.js';
import { verifySessionToken, createSessionToken } from './utils/auth.js';
import { lint as markdownLint } from 'markdownlint/sync';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

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
  if (url.trim().startsWith('-') || /\s/.test(url)) {
    return res.status(400).json({ error: 'Invalid clone URL format' });
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
    const diff = await getCommitDiff();
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
  const { path: filePath, persona, message, history, contextFiles } = req.body as { 
    path: string; 
    persona: string;
    message?: string;
    history?: { role: 'user' | 'model', content: string }[];
    contextFiles?: string[];
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

    const fileContent = await fs.readFile(safePath, 'utf-8');
    const cleanContent = fileContent.replace(/<!--[\s\S]*?-->/g, '');
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
              const cleanSub = subContent.replace(/<!--[\s\S]*?-->/g, '');
              if (cleanSub.trim().length > 0) {
                const relativePath = path.relative(targetDir, subFile);
                contextString += `\n--- Context File: ${relativePath} ---\n${cleanSub}\n`;
              }
            }
          } else {
            const cContent = await fs.readFile(cSafePath, 'utf-8');
            const cleanCContent = cContent.replace(/<!--[\s\S]*?-->/g, '');
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
    const model = genAI.getGenerativeModel({ 
      model: cleanModelName,
      systemInstruction: systemInstruction
    });

    if (history && history.length > 0) {
      const formattedHistory = history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }));
      const chat = model.startChat({ history: formattedHistory });
      const result = await chat.sendMessage(message || '');
      res.json({ feedback: result.response.text() });
    } else {
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
    db.prepare(`
      INSERT OR IGNORE INTO ignored_rules (rule_id, workspace_id) VALUES (?, ?);
    `).run(ruleId, workspaceId);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/grammar/ignored', async (req, res) => {
  try {
    const workspaceId = getActiveWorkspaceId();
    const rows = db.prepare(`
      SELECT rule_id, workspace_id FROM ignored_rules 
      WHERE workspace_id IS NULL OR workspace_id = ?;
    `).all(workspaceId) as { rule_id: string, workspace_id: number | null }[];

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

    db.prepare(`
      INSERT OR IGNORE INTO ignored_instances (file_path, workspace_id, rule_id, context_hash)
      VALUES (?, ?, ?, ?);
    `).run(filePath, workspaceId, ruleId, hash);

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

    const ignoredWords = await getAllApplicableIgnoredWords(getTargetDir(req));

    const workspaceId = getActiveWorkspaceId();
    const ignoredRulesRows = db.prepare(`
      SELECT rule_id FROM ignored_rules 
      WHERE workspace_id IS NULL OR workspace_id = ?;
    `).all(workspaceId) as { rule_id: string }[];
    const ignoredRules = new Set(ignoredRulesRows.map(r => r.rule_id));

    let ignoredInstances = new Set<string>();
    if (filePath && workspaceId) {
      const instanceRows = db.prepare(`
        SELECT rule_id, context_hash FROM ignored_instances
        WHERE file_path = ? AND workspace_id = ?;
      `).all(filePath, workspaceId) as { rule_id: string, context_hash: string }[];
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

  const redirectUri = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/github/callback`;
  const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
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

    if (!clientId) {
      // Mock bypass
      const simulateRow = db.prepare("SELECT value FROM settings WHERE key = 'simulate_hosted_mode';").get() as { value: string } | undefined;
      if (simulateRow?.value === 'true') {
        githubUser = allowed || 'dev_mock_user';
      } else {
        throw new Error('OAuth Client ID is not configured');
      }
    } else {
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
      githubUser = userData.login;
    }

    if (!githubUser) {
      throw new Error('Failed to retrieve GitHub profile info');
    }

    if (allowed && githubUser.toLowerCase() !== allowed.toLowerCase()) {
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
  if (!isHostedModeActive()) {
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
