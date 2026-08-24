import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getTargetDir, getActiveWorkspaceId } from '../config.js';
import { addIgnoredWord, getIgnoredWords, getAllApplicableIgnoredWords } from '../dictionary.js';

export const grammarRouter = Router();

grammarRouter.post('/api/dictionary/add', async (req: AuthenticatedRequest, res: Response) => {
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

grammarRouter.get('/api/dictionary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dictionary = await getIgnoredWords(getTargetDir(req), (req.user as string) || null);
    res.json(dictionary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

grammarRouter.post('/api/grammar/ignore', async (req: AuthenticatedRequest, res: Response) => {
  const { ruleId, scope } = req.body as { ruleId: string, scope: 'global' | 'workspace' };
  if (!ruleId) {
    return res.status(400).json({ error: 'Missing ruleId' });
  }
  if (scope !== 'global' && scope !== 'workspace') {
    return res.status(400).json({ error: 'Invalid scope, must be global or workspace' });
  }

  try {
    const workspaceId = scope === 'workspace' ? getActiveWorkspaceId(req) : null;
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

grammarRouter.get('/api/grammar/ignored', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = getActiveWorkspaceId(req);
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

grammarRouter.post('/api/grammar/ignore-instance', async (req: AuthenticatedRequest, res: Response) => {
  const { ruleId, sentence, filePath } = req.body as { 
    ruleId: string; 
    sentence: string; 
    filePath: string; 
  };
  if (!ruleId || !sentence || !filePath) {
    return res.status(400).json({ error: 'Missing ruleId, sentence, or filePath parameter' });
  }

  try {
    const workspaceId = getActiveWorkspaceId(req);
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

grammarRouter.post('/api/languagetool/check', async (req: AuthenticatedRequest, res: Response) => {
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

    const workspaceId = getActiveWorkspaceId(req);
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
