import { db } from './db.js';
import fs from 'fs/promises';
import path from 'path';

export async function addIgnoredWord(word: string, workspacePath: string | null): Promise<void> {
  const normalized = word.trim().toLowerCase();
  
  if (workspacePath === null) {
    const stmt = db.prepare('INSERT OR IGNORE INTO ignored_words (word, workspace_id) VALUES (?, NULL)');
    stmt.run(normalized);
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
        await fs.writeFile(dictFile, JSON.stringify(words, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('Failed to write workspace dictionary:', err);
    }
  }
}

export async function getIgnoredWords(workspacePath: string | null): Promise<{ global: string[], workspace: string[] }> {
  const globalStmt = db.prepare('SELECT word FROM ignored_words WHERE workspace_id IS NULL');
  const globalRows = globalStmt.all() as { word: string }[];
  const globalWords = globalRows.map(r => r.word);

  let workspaceWords: string[] = [];
  if (workspacePath !== null) {
    const dictFile = path.join(workspacePath, '.marginalia', 'dictionary.json');
    try {
      const content = await fs.readFile(dictFile, 'utf-8');
      workspaceWords = JSON.parse(content) as string[];
    } catch (err) {
      // file doesn't exist, ignore
    }
  }

  return {
    global: globalWords,
    workspace: workspaceWords
  };
}

export async function getAllApplicableIgnoredWords(workspacePath: string | null): Promise<Set<string>> {
  const dict = await getIgnoredWords(workspacePath);
  return new Set([...dict.global, ...dict.workspace]);
}
