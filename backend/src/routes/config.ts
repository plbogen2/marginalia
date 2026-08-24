import { Router, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';
import {
  AuthenticatedRequest,
  getGitHubClientId,
  getGitHubClientSecret,
  getAllowedUser,
} from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const configRouter = Router();

const SERVER_BUILD_TIME = Date.now();

configRouter.get('/api/health', (req: AuthenticatedRequest, res: Response) => {
  res.json({ status: 'ok' });
});

configRouter.get('/api/version', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    res.json({
      version: pkg.version,
      buildTime: SERVER_BUILD_TIME
    });
  } catch {
    res.status(500).json({ error: 'Failed to read package.json' });
  }
});

configRouter.get('/api/changelog', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const changelogPath = path.resolve(__dirname, '../../../CHANGELOG.md');
    const content = await fs.readFile(changelogPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

configRouter.get('/api/config', (req: AuthenticatedRequest, res: Response) => {
  try {
    const hasEnvKey = !!process.env.GEMINI_API_KEY;
    let hasDbKey = false;
    let simulateHostedMode = false;
    let geminiModel = 'gemini-1.5-flash';
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
      hasDbKey = !!(row && row.value);
    } catch {
      // ignore
    }
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'simulate_hosted_mode';").get() as { value: string } | undefined;
      simulateHostedMode = row?.value === 'true';
    } catch {
      // ignore
    }
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_model';").get() as { value: string } | undefined;
      if (row && row.value) {
        geminiModel = row.value;
      }
    } catch {
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

configRouter.post('/api/config', async (req: AuthenticatedRequest, res: Response) => {
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
