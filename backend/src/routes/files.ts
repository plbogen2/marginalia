import { Router, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { lint as markdownLint } from 'markdownlint/sync';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getTargetDir, IGNORED_DIRS, getUserStorageRoot } from '../config.js';
import { isPathSafe, isWorkspacePathAllowed, isAllowedFileType } from '../utils/pathSafety.js';
import { gitShowHead } from '../git.js';

export const filesRouter = Router();

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

filesRouter.get('/api/files', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetDir = getTargetDir(req);
    const files = await getFiles(targetDir);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

filesRouter.get('/api/file', async (req: AuthenticatedRequest, res: Response) => {
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

filesRouter.post('/api/file', async (req: AuthenticatedRequest, res: Response) => {
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

filesRouter.delete('/api/file', async (req: AuthenticatedRequest, res: Response) => {
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

filesRouter.get('/api/fs/list', async (req: AuthenticatedRequest, res: Response) => {
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

filesRouter.post('/api/markdown/lint', (req: AuthenticatedRequest, res: Response) => {
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
