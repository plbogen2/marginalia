import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatMarkdown } from './markdownLinter.js';

describe('formatMarkdown Utility', () => {
  it('trims trailing whitespace from regular lines', () => {
    const input = 'This has trailing spaces   \nAnother line ';
    const expected = 'This has trailing spaces\nAnother line';
    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('preserves markdown double-space line breaks', () => {
    const input = 'First line with markdown break  \nSecond line';
    const expected = 'First line with markdown break  \nSecond line';
    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('preserves clean lines untouched', () => {
    const input = '# Header\n\nSome paragraph text.\n';
    assert.strictEqual(formatMarkdown(input), input);
  });
});
