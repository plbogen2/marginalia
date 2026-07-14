import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getTargetDir, setTargetDir, getRecentWorkspaces, getActiveWorkspaceId, getActiveWorkspaceName, selectWorkspaceByName, IGNORED_DIRS } from './config.js';
import { getGitStatus, gitCommit, gitPush, gitPull, getGitBranch, cloneRepo, hasGitRemote, getGitAheadCount, getCommitDiff } from './git.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { addIgnoredWord, getIgnoredWords, getAllApplicableIgnoredWords } from './dictionary.js';

const app = express();

app.use(express.json());

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
    const targetDir = getTargetDir();
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
    const targetDir = getTargetDir();
    const safePath = path.resolve(targetDir, filePath);
    if (!safePath.startsWith(targetDir)) {
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
    const targetDir = getTargetDir();
    const safePath = path.resolve(targetDir, filePath);
    if (!safePath.startsWith(targetDir)) {
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
    const targetDir = getTargetDir();
    const safePath = path.resolve(targetDir, filePath);
    if (!safePath.startsWith(targetDir)) {
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
    const status = await getGitStatus();
    const hasRemote = await hasGitRemote();
    const ahead = await getGitAheadCount();
    const hasGemini = !!process.env.GEMINI_API_KEY;
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
    const result = await gitCommit(message);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/git/push', async (req, res) => {
  try {
    const result = await gitPush();
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/git/pull', async (req, res) => {
  try {
    const result = await gitPull();
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/git/branch', async (req, res) => {
  try {
    const branch = await getGitBranch();
    res.json({ branch });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/workspaces', (req, res) => {
  try {
    const active = getTargetDir();
    const activeName = getActiveWorkspaceName();
    const recents = getRecentWorkspaces();
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
    await fs.access(resolvedPath);
    await fs.access(path.join(resolvedPath, '.git'));
    
    setTargetDir(resolvedPath);
    res.json({ status: 'ok', path: resolvedPath, name: getActiveWorkspaceName() });
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
    const resolvedPath = selectWorkspaceByName(name);
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
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    
    const result = await cloneRepo(url, resolvedPath);
    setTargetDir(resolvedPath);
    res.json({ status: 'ok', result: `Cloned successfully.\n${result}`, path: resolvedPath, name: getActiveWorkspaceName() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/fs/list', async (req, res) => {
  const { path: queryPath } = req.query as { path?: string };
  const targetPath = queryPath ? path.resolve(queryPath) : os.homedir();

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

app.post('/api/git/suggest-commit-message', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
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
    const workspacePath = scope === 'workspace' ? getTargetDir() : null;
    await addIgnoredWord(word, workspacePath);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/dictionary', async (req, res) => {
  try {
    const dictionary = await getIgnoredWords(getTargetDir());
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

    const ignoredWords = await getAllApplicableIgnoredWords(getTargetDir());

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

export { app };
