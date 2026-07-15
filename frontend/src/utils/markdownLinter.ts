import type { Diagnostic } from '@codemirror/lint';

export const lintMarkdown = async (text: string): Promise<Diagnostic[]> => {
  try {
    const res = await fetch('/api/markdown/lint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error('Markdown lint request failed');
    const { violations } = await res.json() as { violations: any[] };

    const lines = text.split('\n');
    const diagnostics: Diagnostic[] = [];

    for (const v of violations) {
      const lineIdx = v.lineNumber - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;

      let from = 0;
      for (let i = 0; i < lineIdx; i++) {
        from += lines[i].length + 1; // +1 for the newline
      }

      let to = from + lines[lineIdx].length;
      if (v.errorRange && v.errorRange.length === 2) {
        const [col, len] = v.errorRange;
        from += (col - 1);
        to = from + len;
      }

      diagnostics.push({
        from,
        to,
        severity: 'warning',
        message: `${v.ruleNames.join('/')}: ${v.ruleDescription}${v.errorDetail ? ` (${v.errorDetail})` : ''}`
      });
    }

    return diagnostics;
  } catch (err) {
    console.error('Error linting markdown:', err);
    return [];
  }
};

export const formatMarkdown = (text: string): string => {
  return text.split('\n').map(line => {
    // Trim trailing whitespace (but preserve double space line break marker)
    if (line.endsWith(' ') && !line.endsWith('  ')) {
      return line.trimEnd();
    }
    return line;
  }).join('\n');
};
