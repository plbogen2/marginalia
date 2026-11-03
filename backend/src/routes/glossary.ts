import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getTargetDir } from '../config.js';
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
    const workspacePath = getTargetDir(req.user);
    if (!workspacePath) {
      return res.status(400).json({ error: 'No active workspace selected' });
    }

    const [availableFiles, glossaryData] = await Promise.all([
      findAvailableGlossaryCandidates(workspacePath),
      loadWorkspaceGlossary(workspacePath)
    ]);

    res.json({
      config: glossaryData.config,
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
    const workspacePath = getTargetDir(req.user);
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
    const glossaryData = await loadWorkspaceGlossary(workspacePath);
    const availableFiles = await findAvailableGlossaryCandidates(workspacePath);

    res.json({
      status: 'ok',
      config: updatedConfig,
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
    const workspacePath = getTargetDir(req.user);
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
