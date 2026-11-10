import fs from 'fs/promises';
import path from 'path';
import { db } from './db.js';
import { getGitRepoSlug } from './git.js';
import { isPathSafe } from './utils/pathSafety.js';

export interface GlossaryConfig {
  paths: string[];
  autoDetect: boolean;
  enableSpellcheck: boolean;
  enableAutocomplete: boolean;
}

export interface GlossaryTerm {
  term: string;
  normalized: string;
  definition?: string;
  category?: string;
  file: string;
}

export const DEFAULT_GLOSSARY_CONFIG: GlossaryConfig = {
  paths: [],
  autoDetect: true,
  enableSpellcheck: true,
  enableAutocomplete: true
};

// In-memory cache for parsed glossary terms to prevent repetitive disk I/O
interface CacheEntry {
  mtimeMs: number;
  terms: GlossaryTerm[];
  words: Set<string>;
}

const fileCache = new Map<string, CacheEntry>();

export async function getGlossaryConfig(workspacePath: string): Promise<GlossaryConfig> {
  const configFile = path.join(workspacePath, '.marginalia', 'glossary.json');
  try {
    const raw = await fs.readFile(configFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      paths: Array.isArray(parsed.paths) ? parsed.paths : [],
      autoDetect: typeof parsed.autoDetect === 'boolean' ? parsed.autoDetect : true,
      enableSpellcheck: typeof parsed.enableSpellcheck === 'boolean' ? parsed.enableSpellcheck : true,
      enableAutocomplete: typeof parsed.enableAutocomplete === 'boolean' ? parsed.enableAutocomplete : true
    };
  } catch {
    // If not found in workspace file, check SQLite DB for cached config tied to this GitHub repo
    try {
      const repoSlug = await getGitRepoSlug(workspacePath);
      if (repoSlug) {
        const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(`repo_glossary:${repoSlug}`) as { value: string } | undefined;
        if (row && row.value) {
          const parsed = JSON.parse(row.value);
          const config: GlossaryConfig = {
            paths: Array.isArray(parsed.paths) ? parsed.paths : [],
            autoDetect: typeof parsed.autoDetect === 'boolean' ? parsed.autoDetect : true,
            enableSpellcheck: typeof parsed.enableSpellcheck === 'boolean' ? parsed.enableSpellcheck : true,
            enableAutocomplete: typeof parsed.enableAutocomplete === 'boolean' ? parsed.enableAutocomplete : true
          };
          // Persist to workspace repo so it's in the repo filesystem
          const configDir = path.join(workspacePath, '.marginalia');
          await fs.mkdir(configDir, { recursive: true });
          await fs.writeFile(configFile, JSON.stringify(config, null, 2), 'utf-8');
          return config;
        }
      }
    } catch {
      // Ignore DB read failure
    }
    return { ...DEFAULT_GLOSSARY_CONFIG };
  }
}

export async function saveGlossaryConfig(workspacePath: string, config: Partial<GlossaryConfig>): Promise<GlossaryConfig> {
  const current = await getGlossaryConfig(workspacePath);
  const updated: GlossaryConfig = {
    paths: Array.isArray(config.paths) ? config.paths : current.paths,
    autoDetect: typeof config.autoDetect === 'boolean' ? config.autoDetect : current.autoDetect,
    enableSpellcheck: typeof config.enableSpellcheck === 'boolean' ? config.enableSpellcheck : current.enableSpellcheck,
    enableAutocomplete: typeof config.enableAutocomplete === 'boolean' ? config.enableAutocomplete : current.enableAutocomplete
  };

  const configDir = path.join(workspacePath, '.marginalia');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, 'glossary.json'),
    JSON.stringify(updated, null, 2),
    'utf-8'
  );

  // Tie configuration to GitHub repository in DB cache
  try {
    const repoSlug = await getGitRepoSlug(workspacePath);
    if (repoSlug) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);").run(
        `repo_glossary:${repoSlug}`,
        JSON.stringify(updated)
      );
    }
  } catch (err) {
    console.warn('Failed to cache repo glossary config in DB:', err);
  }

  return updated;
}

/**
 * Discovers available candidate markdown files in the workspace that look like lore/glossaries.
 */
export async function findAvailableGlossaryCandidates(workspacePath: string): Promise<string[]> {
  const candidates: string[] = [];

  async function walk(dir: string, relPrefix = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relPrefix, entry.name).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          // Recurse into directories (especially lore, docs, characters, notes)
          await walk(fullPath, relPath);
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
          // Check if file name or path suggests lore or glossary
          const isMatch = /glossary|dramatis|personae|lore|character|world|bible|cast|atlas|gazetteer/i.test(relPath);
          if (isMatch) {
            candidates.push(relPath);
          }
        }
      }
    } catch {
      // Ignore unreadable dirs
    }
  }

  await walk(workspacePath);
  return candidates.sort((a, b) => a.localeCompare(b));
}

/**
 * Resolves which files should be parsed as glossary files based on config.
 */
export async function resolveGlossaryFiles(workspacePath: string, config: GlossaryConfig): Promise<string[]> {
  const resolved = new Set<string>();

  // 1. Explicitly configured paths
  for (const p of config.paths) {
    const trimmed = p.trim().replace(/\\/g, '/');
    if (!trimmed) continue;
    const full = path.join(workspacePath, trimmed);
    if (isPathSafe(full, workspacePath)) {
      try {
        const stat = await fs.stat(full);
        if (stat.isFile()) {
          resolved.add(trimmed);
        }
      } catch {
        // file doesn't exist
      }
    }
  }

  // 2. Auto-detection if enabled or if no paths configured
  if (config.autoDetect || resolved.size === 0) {
    const candidates = await findAvailableGlossaryCandidates(workspacePath);
    for (const c of candidates) {
      resolved.add(c);
    }
  }

  return Array.from(resolved);
}

/**
 * Parses markdown/text content to extract terms, definitions, and word tokens.
 */
export function extractGlossaryTerms(content: string, relativePath: string): { terms: GlossaryTerm[]; words: Set<string> } {
  const terms: GlossaryTerm[] = [];
  const words = new Set<string>();
  const seenTerms = new Set<string>();

  const addTerm = (rawTerm: string, rawDef?: string, category = 'Term') => {
    let cleanTerm = rawTerm
      .replace(/^[`*_'"]+|[`*_'"]+$/g, '')
      .replace(/:\s*$/, '')
      .trim();

    // 1. Strip leading list / outline numbering (e.g. "1. ", "10. ", "13) ")
    cleanTerm = cleanTerm.replace(/^\d+[\.)]\s+/, '').trim();
    // 2. Strip surrounding quotes / backticks / asterisks / underscores
    cleanTerm = cleanTerm.replace(/^[`*_'"]+|[`*_'"]+$/g, '').trim();

    if (!cleanTerm || cleanTerm.length < 2) return;

    // 3. Length & word count caps: in-world vocabulary/names are concise terms,
    // not entire paragraphs, complex headings, or sentences.
    if (cleanTerm.length > 40) return;
    const wordsInTerm = cleanTerm.split(/\s+/);
    if (wordsInTerm.length > 5) return;

    // 4. Reject terms with markdown formatting, LaTeX formulas, or code syntax
    if (/[\*`\$_{}\\]/.test(cleanTerm)) return;

    // 5. Reject sentences or clauses with punctuation
    if (/[\.\?!;]/.test(cleanTerm)) return;

    const normalized = cleanTerm.toLowerCase();
    if (seenTerms.has(normalized)) return;
    seenTerms.add(normalized);

    const definition = rawDef?.trim().replace(/^[:—\-]\s*/, '').trim() || undefined;

    terms.push({
      term: cleanTerm,
      normalized,
      definition: definition ? (definition.length > 200 ? definition.substring(0, 197) + '...' : definition) : undefined,
      category,
      file: relativePath
    });

    // Also index individual word tokens for spell check suppression
    const tokens = cleanTerm.match(/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF'-]{2,}/g) || [];
    for (const t of tokens) {
      const w = t.toLowerCase().replace(/(['’]s|['’])$/, '');
      if (w.length >= 2) {
        words.add(w);
      }
      // If token is hyphenated (e.g. Sen-Koldo, Ala-Eskor), also add parts
      if (w.includes('-')) {
        for (const part of w.split('-')) {
          if (part.length >= 2) words.add(part);
        }
      }
    }
  };

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Markdown list item with bold or backtick term:
    // e.g. "* **Tibon Sen-Koldo** (43): Archival Assayer & Special Examiner..."
    // e.g. "- **`Sen-`** (from Proto-Basque *seni/seme*): Son / statutory male lineage"
    // e.g. "* **Marta Ala-Eskor**: Bathhouse Master..."
    const listItemMatch = line.match(/^[-*+]\s+(?:`\*\*|\*\*`|\*\*|`)([^`*]+)(?:`\*\*|\*\*`|\*\*|`)(?:\s*\(([^)]+)\))?\s*[:—\-]?\s*(.*)$/);
    if (listItemMatch) {
      const termName = listItemMatch[1];
      const parenDetail = listItemMatch[2];
      const rest = listItemMatch[3];
      const def = parenDetail ? (rest ? `(${parenDetail}) ${rest}` : `(${parenDetail})`) : rest;
      addTerm(termName, def, 'Entry');
      continue;
    }

    // 2. Markdown Headings (e.g. "### Piotr / Piotr Euria" or "### Tibon Sen-Koldo")
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      let headingText = headingMatch[1].trim();

      // Strip leading outline numbering e.g. "1. ", "10. "
      headingText = headingText.replace(/^\d+[\.)]\s+/, '').trim();

      // If heading contains markdown bold annotations like "**Subtitle**", extract as definition hint
      let headingDef: string | undefined;
      const boldAnnotationMatch = headingText.match(/^(.*?)\s+(\*\*.*?\*\*)$/);
      if (boldAnnotationMatch) {
        headingText = boldAnnotationMatch[1].trim();
        headingDef = boldAnnotationMatch[2].replace(/\*\*/g, '').trim();
      }

      // If heading has parenthetical info: "Term (Details or Alias)"
      const parenMatch = headingText.match(/^(.*?)\s*\(([^)]+)\)(.*)$/);
      if (parenMatch) {
        const primary = parenMatch[1].trim();
        const parenContent = parenMatch[2].trim();
        const remainder = (parenMatch[3] || '').trim();
        const cleanAlias = parenContent.replace(/^[*_']+|[*_']+$/g, '').trim();

        if (primary && primary.split(/\s+/).length <= 5) {
          addTerm(primary, headingDef || (remainder ? `${parenContent} ${remainder}` : parenContent), 'Heading');
        }
        if (
          cleanAlias &&
          cleanAlias.length <= 30 &&
          cleanAlias.split(/\s+/).length <= 4 &&
          !/[\$*`_{}\\]/.test(cleanAlias) &&
          !/^\d+/.test(cleanAlias)
        ) {
          addTerm(cleanAlias, primary, 'Alias');
        }
        continue;
      }

      // If heading has colon or em-dash separating title from subtitle: "Term: Subtitle"
      const colonMatch = headingText.match(/^(.*?)\s*[:—\-]\s+(.+)$/);
      if (colonMatch) {
        const potentialTerm = colonMatch[1].trim();
        const potentialDef = colonMatch[2].trim();
        if (potentialTerm.split(/\s+/).length <= 4) {
          headingText = potentialTerm;
          headingDef = headingDef ? `${potentialDef} (${headingDef})` : potentialDef;
        }
      }

      // If heading has slash, e.g. "Piotr / Piotr Euria"
      if (headingText.includes('/')) {
        const parts = headingText.split('/').map(p => p.trim());
        for (const p of parts) {
          addTerm(p, headingDef, 'Heading');
        }
      } else {
        // Look ahead for next non-empty line as definition if none found in heading
        if (!headingDef && i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !nextLine.startsWith('#') && !nextLine.startsWith('|')) {
            headingDef = nextLine.replace(/^[-*+]\s+/, '');
          }
        }
        addTerm(headingText, headingDef, 'Heading');
      }
      continue;
    }

    // 3. Table rows: "| Term | Definition |"
    if (line.startsWith('|') && line.endsWith('|')) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2 && !cols[0].startsWith('---') && cols[0].toLowerCase() !== 'term') {
        addTerm(cols[0], cols[1], 'Table');
      }
      continue;
    }

    // 4. Key-Value definition: "Term: Definition"
    const kvMatch = line.match(/^([A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F\s'-]{1,35}?)\s*:\s+(.+)$/);
    if (kvMatch && !kvMatch[1].toLowerCase().startsWith('http') && kvMatch[1].split(/\s+/).length <= 4) {
      addTerm(kvMatch[1], kvMatch[2], 'Definition');
      continue;
    }
  }

  // Also collect all capitalized words in lore file as recognized tokens
  const allCaps = content.match(/[A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F'-]{2,}/g) || [];
  for (const w of allCaps) {
    const clean = w.replace(/(['’]s|['’])$/, '').toLowerCase();
    if (clean.length >= 2) {
      words.add(clean);
      if (clean.includes('-')) {
        for (const part of clean.split('-')) {
          if (part.length >= 2) words.add(part);
        }
      }
    }
  }

  return { terms, words };
}

/**
 * Loads and returns all glossary terms and words across the workspace's configured glossary files.
 */
export async function loadWorkspaceGlossary(workspacePath: string): Promise<{
  config: GlossaryConfig;
  resolvedFiles: string[];
  terms: GlossaryTerm[];
  words: Set<string>;
}> {
  const config = await getGlossaryConfig(workspacePath);
  const resolvedFiles = await resolveGlossaryFiles(workspacePath, config);

  const allTerms: GlossaryTerm[] = [];
  const allWords = new Set<string>();

  for (const relFile of resolvedFiles) {
    const fullPath = path.join(workspacePath, relFile);
    try {
      const stat = await fs.stat(fullPath);
      const cached = fileCache.get(fullPath);
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        for (const t of cached.terms) allTerms.push(t);
        for (const w of cached.words) allWords.add(w);
        continue;
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      const { terms, words } = extractGlossaryTerms(content, relFile);

      fileCache.set(fullPath, {
        mtimeMs: stat.mtimeMs,
        terms,
        words
      });

      for (const t of terms) allTerms.push(t);
      for (const w of words) allWords.add(w);
    } catch {
      // File inaccessible, skip
    }
  }

  // Sort terms alphabetically
  allTerms.sort((a, b) => a.term.localeCompare(b.term));

  return {
    config,
    resolvedFiles,
    terms: allTerms,
    words: allWords
  };
}

/**
 * Returns the set of recognized words extracted from the workspace glossary for spell check.
 */
export async function getGlossaryWordsForSpellcheck(workspacePath: string | null): Promise<Set<string>> {
  if (!workspacePath) return new Set();
  try {
    const data = await loadWorkspaceGlossary(workspacePath);
    if (!data.config.enableSpellcheck) return new Set();
    return data.words;
  } catch {
    return new Set();
  }
}
