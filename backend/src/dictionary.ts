import { db } from './db.js';
import fs from 'fs/promises';
import path from 'path';

export async function addIgnoredWord(word: string, workspacePath: string | null, user: string | null = null): Promise<void> {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return;
  
  if (workspacePath === null) {
    if (user) {
      const stmt = db.prepare('INSERT OR IGNORE INTO ignored_words (word, workspace_id, user) VALUES (?, NULL, ?)');
      stmt.run(normalized, user);
    } else {
      const stmt = db.prepare('INSERT OR IGNORE INTO ignored_words (word, workspace_id, user) VALUES (?, NULL, NULL)');
      stmt.run(normalized);
    }
  } else {
    const configDir = path.join(workspacePath, '.marginalia');
    const dictFile = path.join(configDir, 'dictionary.json');
    
    try {
      await fs.mkdir(configDir, { recursive: true });
      let words: string[] = [];
      try {
        const content = await fs.readFile(dictFile, 'utf-8');
        words = JSON.parse(content) as string[];
      } catch (err) {
        // file doesn't exist or is invalid, treat as empty
      }
      
      if (!words.includes(normalized)) {
        words.push(normalized);
        words.sort((a, b) => a.localeCompare(b));
        await fs.writeFile(dictFile, JSON.stringify(words, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('Failed to write workspace dictionary:', err);
    }
  }
}

export async function removeIgnoredWord(word: string, workspacePath: string | null, user: string | null = null): Promise<void> {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return;

  if (workspacePath === null) {
    if (user) {
      const stmt = db.prepare('DELETE FROM ignored_words WHERE word = ? AND workspace_id IS NULL AND (user = ? OR user IS NULL)');
      stmt.run(normalized, user);
    } else {
      const stmt = db.prepare('DELETE FROM ignored_words WHERE word = ? AND workspace_id IS NULL AND user IS NULL');
      stmt.run(normalized);
    }
  } else {
    const dictFile = path.join(workspacePath, '.marginalia', 'dictionary.json');
    try {
      const content = await fs.readFile(dictFile, 'utf-8');
      let words = JSON.parse(content) as string[];
      const filtered = words.filter(w => w.toLowerCase() !== normalized);
      if (filtered.length !== words.length) {
        await fs.writeFile(dictFile, JSON.stringify(filtered, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('Failed to update workspace dictionary on remove:', err);
    }
  }
}

export async function bulkAddIgnoredWords(rawWords: string[], workspacePath: string | null, user: string | null = null): Promise<number> {
  const normalizedWords = Array.from(new Set(
    rawWords
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0)
  ));

  if (normalizedWords.length === 0) return 0;

  if (workspacePath === null) {
    let addedCount = 0;
    const insertStmt = user
      ? db.prepare('INSERT OR IGNORE INTO ignored_words (word, workspace_id, user) VALUES (?, NULL, ?)')
      : db.prepare('INSERT OR IGNORE INTO ignored_words (word, workspace_id, user) VALUES (?, NULL, NULL)');

    for (const w of normalizedWords) {
      const res = user ? insertStmt.run(w, user) : insertStmt.run(w);
      if (res && res.changes && res.changes > 0) {
        addedCount++;
      }
    }
    return addedCount;
  } else {
    const configDir = path.join(workspacePath, '.marginalia');
    const dictFile = path.join(configDir, 'dictionary.json');
    try {
      await fs.mkdir(configDir, { recursive: true });
      let words: string[] = [];
      try {
        const content = await fs.readFile(dictFile, 'utf-8');
        words = JSON.parse(content) as string[];
      } catch (err) {
        // treat as empty
      }

      const existingSet = new Set(words.map(w => w.toLowerCase()));
      let addedCount = 0;
      for (const w of normalizedWords) {
        if (!existingSet.has(w)) {
          words.push(w);
          existingSet.add(w);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        words.sort((a, b) => a.localeCompare(b));
        await fs.writeFile(dictFile, JSON.stringify(words, null, 2), 'utf-8');
      }
      return addedCount;
    } catch (err) {
      console.error('Failed to bulk write workspace dictionary:', err);
      return 0;
    }
  }
}

export async function getIgnoredWords(workspacePath: string | null, user: string | null = null): Promise<{ global: string[], workspace: string[] }> {
  let globalWords: string[] = [];
  if (user) {
    const globalStmt = db.prepare('SELECT word FROM ignored_words WHERE workspace_id IS NULL AND (user = ? OR user IS NULL) ORDER BY word ASC');
    const globalRows = globalStmt.all(user) as { word: string }[];
    globalWords = globalRows.map(r => r.word);
  } else {
    const globalStmt = db.prepare('SELECT word FROM ignored_words WHERE workspace_id IS NULL AND user IS NULL ORDER BY word ASC');
    const globalRows = globalStmt.all() as { word: string }[];
    globalWords = globalRows.map(r => r.word);
  }

  let workspaceWords: string[] = [];
  if (workspacePath !== null) {
    const dictFile = path.join(workspacePath, '.marginalia', 'dictionary.json');
    try {
      const content = await fs.readFile(dictFile, 'utf-8');
      workspaceWords = JSON.parse(content) as string[];
      workspaceWords.sort((a, b) => a.localeCompare(b));
    } catch (err) {
      // file doesn't exist, ignore
    }
  }

  return {
    global: globalWords,
    workspace: workspaceWords
  };
}

export async function getAllApplicableIgnoredWords(workspacePath: string | null, user: string | null = null): Promise<Set<string>> {
  const dict = await getIgnoredWords(workspacePath, user);
  return new Set([...dict.global, ...dict.workspace]);
}

const COMMON_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot',
  'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
  'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
  'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re',
  'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who',
  'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re',
  'you\'ve', 'your', 'yours', 'yourself', 'yourselves', 'chapter', 'section', 'part', 'book', 'act', 'scene', 'page',
  'author', 'title', 'version', 'date', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'sunday', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'first', 'second', 'third',
  'true', 'false', 'null', 'yes', 'no', 'okay', 'well', 'now', 'then', 'also', 'even', 'still', 'never', 'always',
  'back', 'away', 'around', 'down', 'up', 'into', 'onto', 'upon', 'within', 'without', 'behind', 'beside', 'beneath',
  'along', 'across', 'throughout', 'towards', 'toward', 'against', 'among', 'amid', 'amidst', 'over', 'underneath',
  'said', 'asked', 'replied', 'whispered', 'shouted', 'yelled', 'answered', 'thought', 'felt', 'looked', 'seemed',
  'stood', 'walked', 'stepped', 'turned', 'moved', 'nodded', 'smiled', 'sighed', 'frowned', 'glanced', 'stared'
]);

export async function scanWorkspaceForInWorldWords(workspacePath: string): Promise<string[]> {
  const candidateWords = new Set<string>();

  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            extractWordsFromMarkdown(content, candidateWords, entry.name);
          } catch (e) {
            // ignore unreadable files
          }
        }
      }
    } catch (e) {
      // ignore unreadable dirs
    }
  }

  await walk(workspacePath);

  // Filter out stop words, numbers, and short strings
  const filtered = Array.from(candidateWords)
    .map(w => w.trim().toLowerCase())
    .filter(w => {
      if (w.length < 3) return false;
      if (/^\d+$/.test(w)) return false;
      if (COMMON_STOP_WORDS.has(w)) return false;
      return true;
    });

  return Array.from(new Set(filtered)).sort((a, b) => a.localeCompare(b));
}

function extractWordsFromMarkdown(content: string, set: Set<string>, fileName: string) {
  // 1. High-priority extraction: Character names & Lore terms in headings / bold / italics / quotes
  // e.g. "### Piotr Euria", "**Seuragois**", "*Goideltaren*", "«Aihèarin»", "“Kallath”"
  const emphasisRegex = /[*_]{1,3}([a-zA-Z\u00C0-\u024F\u1E00-\u1EFF'-]{3,})[*_]{1,3}/g;
  let match: RegExpExecArray | null;
  while ((match = emphasisRegex.exec(content)) !== null) {
    const word = match[1].replace(/(['’]s|['’])$/, '');
    if (word.length >= 3) set.add(word);
  }

  // 2. Headings (e.g. ### Piotr / Piotr Euria (Emperor Alander Besel))
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  while ((match = headingRegex.exec(content)) !== null) {
    const headingText = match[1];
    const words = headingText.match(/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF'-]{3,}/g) || [];
    for (const w of words) {
      const clean = w.replace(/(['’]s|['’])$/, '');
      if (clean.length >= 3 && /^[A-Z\u00C0-\u024F]/.test(clean)) {
        set.add(clean);
      }
    }
  }

  // 3. For dramatis_personae, characters, lore, and glossary files: extract all capitalized words and hyphenated terms
  const isLoreFile = /dramatis|lore|character|glossary|personae|cast|world/i.test(fileName);
  if (isLoreFile) {
    const words = content.match(/[A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F'-]{2,}/g) || [];
    for (const w of words) {
      const clean = w.replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '').replace(/(['’]s|['’])$/, '');
      if (clean.length >= 3) {
        set.add(clean);
      }
    }
  }
}
