export interface ConflictBlock {
  id: string;
  startIndex: number;
  endIndex: number;
  currentText: string;
  incomingText: string;
  baseText?: string;
}

export interface ParseResult {
  hasConflicts: boolean;
  blocks: ConflictBlock[];
  cleanText?: string;
}

/**
 * Parses Git conflict markers in a file's content.
 * Matches:
 * <<<<<<< [currentBranch]
 * current changes
 * ||||||| [baseBranch] (optional in diff3)
 * base changes
 * =======
 * incoming changes
 * >>>>>>> [incomingBranch]
 */
export function parseConflictMarkers(content: string): ParseResult {
  const conflictRegex = /^<{7}[^\n]*\n([\s\S]*?)(?:^\|{7}[^\n]*\n([\s\S]*?))?^={7}\n([\s\S]*?)^>{7}[^\n]*(?:\n|$)/gm;
  const blocks: ConflictBlock[] = [];
  let match: RegExpExecArray | null;
  let idCounter = 1;

  while ((match = conflictRegex.exec(content)) !== null) {
    blocks.push({
      id: `conflict-${idCounter++}`,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      currentText: match[1] || '',
      baseText: match[2] !== undefined ? match[2] : undefined,
      incomingText: match[3] || '',
    });
  }

  return {
    hasConflicts: blocks.length > 0,
    blocks,
  };
}

export type ResolutionChoice = 'current' | 'incoming' | 'both';

/**
 * Resolves all conflict blocks in content according to the provided resolutions mapping.
 */
export function resolveConflictsInContent(
  content: string,
  resolutions: Record<string, ResolutionChoice>
): string {
  const { blocks } = parseConflictMarkers(content);
  if (blocks.length === 0) return content;

  let result = '';
  let lastIndex = 0;

  for (const block of blocks) {
    result += content.substring(lastIndex, block.startIndex);
    const choice = resolutions[block.id] || 'current';
    if (choice === 'current') {
      result += block.currentText;
    } else if (choice === 'incoming') {
      result += block.incomingText;
    } else if (choice === 'both') {
      result += block.currentText + block.incomingText;
    }
    lastIndex = block.endIndex;
  }

  result += content.substring(lastIndex);
  return result;
}
