import type { Diagnostic } from '@codemirror/lint';

export const lintMarkdown = (text: string): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split('\n');

  let inCodeBlock = false;
  let lastHeaderLevel = 0;
  let hasH1 = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Calculate character offsets for CodeMirror Diagnostic
    let from = 0;
    for (let j = 0; j < i; j++) {
      from += lines[j].length + 1; // +1 for the newline
    }
    const to = from + line.length;

    // Code blocks check
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    // Rule 1: Trailing whitespace (excluding valid line break spacing of exactly 2 spaces)
    if (line.endsWith(' ') && !line.endsWith('  ')) {
      const trailingLength = line.length - line.trimEnd().length;
      if (trailingLength > 0) {
        diagnostics.push({
          from: to - trailingLength,
          to: to,
          severity: 'warning',
          message: 'Trailing whitespace is not recommended. Remove it, or use exactly two spaces for a line break.'
        });
      }
    }

    // Rule 2: Heading validations
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      // First header should be H1
      if (!hasH1 && level !== 1) {
        diagnostics.push({
          from: from,
          to: to,
          severity: 'warning',
          message: 'Document structure check: The first heading should be a level 1 heading (#).'
        });
      }
      if (level === 1) {
        hasH1 = true;
      }

      // Heading levels should increment by only one (no H1 -> H3)
      if (lastHeaderLevel > 0 && level > lastHeaderLevel + 1) {
        diagnostics.push({
          from: from,
          to: to,
          severity: 'warning',
          message: `Heading level structure check: Level jumps from H${lastHeaderLevel} to H${level}. Heading levels should increment by only one at a time.`
        });
      }
      lastHeaderLevel = level;

      // Heading should not end with punctuation marks
      if (/[.,;:!?]$/.test(title)) {
        diagnostics.push({
          from: from,
          to: to,
          severity: 'warning',
          message: 'Styling check: Headings should not end with a punctuation mark.'
        });
      }
    }

    // Rule 3: Missing descriptive alt text inside images
    const imgMatch = line.match(/!\[\]\((.+?)\)/);
    if (imgMatch) {
      diagnostics.push({
        from: from,
        to: to,
        severity: 'warning',
        message: 'Accessibility check: Image is missing descriptive alternative text (![alt text](url)).'
      });
    }
  }

  return diagnostics;
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
