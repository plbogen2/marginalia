import { db } from './db.js';

export function addIgnoredWord(word: string, workspaceId: number | null): void {
  const normalized = word.trim().toLowerCase();
  const stmt = db.prepare('INSERT OR IGNORE INTO ignored_words (word, workspace_id) VALUES (?, ?)');
  stmt.run(normalized, workspaceId);
}

export function getIgnoredWords(workspaceId: number | null): { global: string[], workspace: string[] } {
  const globalStmt = db.prepare('SELECT word FROM ignored_words WHERE workspace_id IS NULL');
  const globalRows = globalStmt.all() as { word: string }[];
  const globalWords = globalRows.map(r => r.word);

  let workspaceWords: string[] = [];
  if (workspaceId !== null) {
    const wsStmt = db.prepare('SELECT word FROM ignored_words WHERE workspace_id = ?');
    const wsRows = wsStmt.all(workspaceId) as { word: string }[];
    workspaceWords = wsRows.map(r => r.word);
  }

  return {
    global: globalWords,
    workspace: workspaceWords
  };
}

export function getAllApplicableIgnoredWords(workspaceId: number | null): Set<string> {
  const dict = getIgnoredWords(workspaceId);
  return new Set([...dict.global, ...dict.workspace]);
}
