import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getTargetDir, getActiveWorkspaceId } from '../config.js';
import {
  addIgnoredWord,
  removeIgnoredWord,
  bulkAddIgnoredWords,
  getIgnoredWords,
  getAllApplicableIgnoredWords,
  scanWorkspaceForInWorldWords
} from '../dictionary.js';

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

grammarRouter.post('/api/dictionary/remove', async (req: AuthenticatedRequest, res: Response) => {
  const { word, scope } = req.body as { word: string, scope: 'global' | 'workspace' };
  if (!word) {
    return res.status(400).json({ error: 'Missing word' });
  }
  if (scope !== 'global' && scope !== 'workspace') {
    return res.status(400).json({ error: 'Invalid scope, must be global or workspace' });
  }

  try {
    const workspacePath = scope === 'workspace' ? getTargetDir(req) : null;
    await removeIgnoredWord(word, workspacePath, (req.user as string) || null);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

grammarRouter.post('/api/dictionary/bulk-add', async (req: AuthenticatedRequest, res: Response) => {
  const { words, scope } = req.body as { words: string[], scope: 'global' | 'workspace' };
  if (!Array.isArray(words)) {
    return res.status(400).json({ error: 'Missing words array' });
  }
  if (scope !== 'global' && scope !== 'workspace') {
    return res.status(400).json({ error: 'Invalid scope, must be global or workspace' });
  }

  try {
    const workspacePath = scope === 'workspace' ? getTargetDir(req) : null;
    const addedCount = await bulkAddIgnoredWords(words, workspacePath, (req.user as string) || null);
    res.json({ status: 'ok', addedCount });
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

grammarRouter.post('/api/dictionary/scan-lore', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspacePath = getTargetDir(req);
    if (!workspacePath) {
      return res.status(400).json({ error: 'No active workspace selected' });
    }

    const { autoAdd, scope } = req.body as { autoAdd?: boolean, scope?: 'global' | 'workspace' };
    const words = await scanWorkspaceForInWorldWords(workspacePath);

    let addedCount = 0;
    if (autoAdd && words.length > 0) {
      const targetScope = scope || 'workspace';
      const targetWorkspace = targetScope === 'workspace' ? workspacePath : null;
      addedCount = await bulkAddIgnoredWords(words, targetWorkspace, (req.user as string) || null);
    }

    res.json({ words, count: words.length, addedCount });
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
    // Preserve exact character offsets from original text (including CRLF \r\n and multiple newlines)
    const cleanText = text.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));
    const paragraphs: { text: string; start: number }[] = [];
    const paragraphRegex = /\r?\n\r?\n/g;
    let lastIndex = 0;
    let pMatch: RegExpExecArray | null;

    while ((pMatch = paragraphRegex.exec(cleanText)) !== null) {
      paragraphs.push({
        text: cleanText.substring(lastIndex, pMatch.index),
        start: lastIndex
      });
      lastIndex = pMatch.index + pMatch[0].length;
    }
    paragraphs.push({
      text: cleanText.substring(lastIndex),
      start: lastIndex
    });

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

    // Comprehensive helper to check if a word, stem, plural, or hyphenated compound is in ignoredWords
    const isIgnored = (w: string): boolean => {
      if (!w) return false;
      const clean = w.trim().toLowerCase().replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '');
      if (!clean) return false;

      // 1. Direct match
      if (ignoredWords.has(clean)) return true;

      // 2. Strip possessive suffixes ('s, ’s, ', ’)
      const stem = clean.replace(/(['’]s|['’])$/, '');
      if (stem !== clean && ignoredWords.has(stem)) return true;

      // 3. Strip plural suffixes (s, es)
      if (clean.endsWith('s') && ignoredWords.has(clean.slice(0, -1))) return true;
      if (clean.endsWith('es') && ignoredWords.has(clean.slice(0, -2))) return true;

      // 4. Hyphenated compound: if all non-empty sub-parts are ignored
      if (clean.includes('-')) {
        const parts = clean.split('-').filter(Boolean);
        if (parts.length > 1 && parts.every(p => isIgnored(p))) {
          return true;
        }
      }

      return false;
    };

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

      // 3. Filter out spelling/typo/in-world ignored words
      const matchedSpan = text.substring(match.offset, match.offset + match.length).trim();
      const cleanToken = matchedSpan.replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '').toLowerCase();

      // If the matched token is an ignored in-world word, always suppress
      if (isIgnored(cleanToken)) {
        return false;
      }

      const isTypoOrSpelling = 
        match.rule?.issueType === 'misspelling' || 
        match.rule?.category?.id === 'TYPOS' || 
        match.type?.typeName === 'UnknownWord';

      if (isTypoOrSpelling) {
        // If it was flagged as a misspelling/typo and matches ignored word
        if (isIgnored(cleanToken)) {
          return false;
        }
        return true;
      }

      // For non-spelling rules (e.g. UPPERCASE_SENTENCE_START or EN_A_VS_AN or EN_COMPOUNDS),
      // if the rule is complaining about an in-world word, suppress it
      const wordsInSpan = cleanToken.split(/[\s-]+/).filter(Boolean);
      if (wordsInSpan.length > 0 && wordsInSpan.some(w => isIgnored(w))) {
        const catId = match.rule?.category?.id;
        const ruleId = match.rule?.id;
        if (
          catId === 'PUNCTUATION' || 
          catId === 'TYPOGRAPHY' ||
          ruleId === 'UPPERCASE_SENTENCE_START' || 
          ruleId === 'EN_A_VS_AN' ||
          ruleId === 'EN_COMPOUNDS' ||
          ruleId === 'COMPOUNDING_RULE'
        ) {
          return false;
        }
      }

      return true;
    });

    res.json({ matches: filteredMatches });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
