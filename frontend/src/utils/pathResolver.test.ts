import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveRelativePath } from './pathResolver.js';

describe('resolveRelativePath Utility', () => {
  it('resolves sibling relative links', () => {
    assert.strictEqual(
      resolveRelativePath('chapter1.md', './chapter2.md'),
      'chapter2.md'
    );
    assert.strictEqual(
      resolveRelativePath('docs/intro.md', 'setup.md'),
      'docs/setup.md'
    );
  });

  it('resolves parent relative links', () => {
    assert.strictEqual(
      resolveRelativePath('docs/guides/advanced.md', '../overview.md'),
      'docs/overview.md'
    );
    assert.strictEqual(
      resolveRelativePath('docs/guides/advanced.md', '../../readme.md'),
      'readme.md'
    );
  });

  it('resolves absolute root links', () => {
    assert.strictEqual(
      resolveRelativePath('docs/guides/advanced.md', '/root_file.md'),
      'root_file.md'
    );
  });

  it('handles URL encoding', () => {
    assert.strictEqual(
      resolveRelativePath('notes/index.md', 'chapter%201.md'),
      'notes/chapter 1.md'
    );
  });
});
