import { Router, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getGitStatus,
  gitCommit,
  gitPush,
  gitPull,
  getGitBranch,
  hasGitRemote,
  getGitAheadCount,
  getCommitDiff,
} from '../git.js';

export const gitRouter = Router();

gitRouter.get('/api/git/status', async (req: AuthenticatedRequest, res: Response) => {
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
      } catch {
        // ignore
      }
    }
    res.json({ status, hasRemote, ahead, hasGemini });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

gitRouter.post('/api/git/commit', async (req: AuthenticatedRequest, res: Response) => {
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

gitRouter.post('/api/git/push', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await gitPush(req);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

gitRouter.post('/api/git/pull', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await gitPull(req);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

gitRouter.get('/api/git/branch', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const branch = await getGitBranch(req);
    res.json({ branch });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

gitRouter.get('/api/git/diff', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const diff = await getCommitDiff(req);
    res.json({ diff });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

gitRouter.post('/api/git/suggest-commit-message', async (req: AuthenticatedRequest, res: Response) => {
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
    } catch {
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
