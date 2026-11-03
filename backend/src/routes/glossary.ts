import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getTargetDir } from '../config.js';
import { getGitRepoSlug } from '../git.js';
import {
  getGlossaryConfig,
  saveGlossaryConfig,
  findAvailableGlossaryCandidates,
  loadWorkspaceGlossary
} from '../glossary.js';

export const glossaryRouter = Router();

// GET /api/glossary: returns configuration, candidate files, and all extracted terms
glossaryRouter.get('/api/glossary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspacePath = getTargetDir(req);
    if (!workspacePath) {
      return res.status(400).json({ error: 'No active workspace selected' });
    }

    const [availableFiles, glossaryData, repoSlug] = await Promise.all([
      findAvailableGlossaryCandidates(workspacePath),
      loadWorkspaceGlossary(workspacePath),
      getGitRepoSlug(workspacePath)
    ]);

    res.json({
      config: glossaryData.config,
      repoSlug,
      availableFiles,
      resolvedFiles: glossaryData.resolvedFiles,
      terms: glossaryData.terms,
      count: glossaryData.terms.length
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/glossary/config: updates workspace glossary settings
glossaryRouter.post('/api/glossary/config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspacePath = getTargetDir(req);
    if (!workspacePath) {
      return res.status(400).json({ error: 'No active workspace selected' });
    }

    const body = req.body as {
      paths?: string[];
      autoDetect?: boolean;
      enableSpellcheck?: boolean;
      enableAutocomplete?: boolean;
    };

    const updatedConfig = await saveGlossaryConfig(workspacePath, body);
    const [glossaryData, availableFiles, repoSlug] = await Promise.all([
      loadWorkspaceGlossary(workspacePath),
      findAvailableGlossaryCandidates(workspacePath),
      getGitRepoSlug(workspacePath)
    ]);

    res.json({
      status: 'ok',
      config: updatedConfig,
      repoSlug,
      availableFiles,
      resolvedFiles: glossaryData.resolvedFiles,
      terms: glossaryData.terms,
      count: glossaryData.terms.length
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/glossary/terms: lightweight autocomplete suggestions
glossaryRouter.get('/api/glossary/terms', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspacePath = getTargetDir(req);
    if (!workspacePath) {
      return res.json({ terms: [] });
    }

    const glossaryData = await loadWorkspaceGlossary(workspacePath);
    if (!glossaryData.config.enableAutocomplete) {
      return res.json({ terms: [] });
    }

    res.json({
      terms: glossaryData.terms
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
