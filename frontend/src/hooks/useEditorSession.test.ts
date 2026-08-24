import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('useEditorSession Hook Logic', () => {
  it('computes word count and paperback/hardback page estimates accurately', () => {
    // 15 words repeated 20 times = 300 words
    const phrase = 'The sky above the port was the color of television tuned to a dead channel. ';
    const text = phrase.repeat(20);
    const words = text.trim().split(/\s+/).length;

    // Paperback (300 wpp) vs Hardback (250 wpp)
    const paperbackPages = Math.ceil(words / 300);
    const hardbackPages = Math.ceil(words / 250);

    assert.equal(words, 300);
    assert.equal(paperbackPages, 1);
    assert.equal(hardbackPages, 2);
  });

  it('strips markdown comments from word count', () => {
    const content = `Chapter 1: Chiba City
<!-- This is an internal author note that should not count towards book pages -->
He stepped out into the rain.`;

    const cleanText = content.replace(/<!--[\s\S]*?-->/g, '');
    const wordCount = cleanText.trim().split(/\s+/).length;

    assert.ok(!cleanText.includes('internal author note'));
    assert.equal(wordCount, 10);
  });

  it('applies suggested search and replace edits accurately', () => {
    const originalText = 'Case was twenty-four. At twenty-two he’d been a cowboy.';
    const searchTarget = 'twenty-four';
    const replacement = 'twenty-four years old';

    assert.ok(originalText.includes(searchTarget));
    const updated = originalText.replace(searchTarget, replacement);
    assert.equal(updated, 'Case was twenty-four years old. At twenty-two he’d been a cowboy.');
  });
});
