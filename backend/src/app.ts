import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { TARGET_DIR, IGNORED_DIRS } from './config.js';
import { getGitStatus, gitCommit, gitPush, gitPull, getGitBranch } from './git.js';

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
    const files = await getFiles(TARGET_DIR);
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
    const safePath = path.resolve(TARGET_DIR, filePath);
    if (!safePath.startsWith(TARGET_DIR)) {
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
    const safePath = path.resolve(TARGET_DIR, filePath);
    if (!safePath.startsWith(TARGET_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/git/status', async (req, res) => {
  try {
    const status = await getGitStatus();
    res.json({ status });
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

export { app };
