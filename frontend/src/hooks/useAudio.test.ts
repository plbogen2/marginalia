import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoParagraphChunks, parseFrontmatterCast } from './useAudio.js';

describe('useAudio Hook Logic & Chunking', () => {
  it('parses frontmatter cast definitions correctly', () => {
    const textWithCast = `---
title: Chiba City Blues
cast:
  - Case: Puck
  - Linda: Aoede
  - Hotel Clerk: Charon
---

The sky above the port was the color of television, tuned to a dead channel.
`;
    const cast = parseFrontmatterCast(textWithCast);
    assert.ok(cast);
    assert.equal(cast['Case'], 'Puck');
    assert.equal(cast['Linda'], 'Aoede');
    assert.equal(cast['Hotel Clerk'], 'Charon');
  });

  it('returns undefined when no cast is specified in frontmatter', () => {
    const plainFrontmatter = `---
title: Plain Title
author: William Gibson
---

Some narrative prose without cast block.`;
    const cast = parseFrontmatterCast(plainFrontmatter);
    assert.equal(cast, undefined);
  });

  it('splits narrative text into clean paragraph chunks and strips frontmatter', () => {
    const fullText = `---
title: Test
---

Paragraph 1: The neon lights flickered over the alleyway.

Paragraph 2: "Where are you going?" asked Case.

Paragraph 3: She turned away without answering.`;

    const chunks = splitIntoParagraphChunks(fullText, 350);
    assert.ok(chunks.length >= 3);
    assert.ok(chunks[0].includes('The neon lights flickered'));
    assert.ok(chunks.some(c => c.includes('Where are you going')));
    assert.ok(chunks.some(c => c.includes('She turned away')));
    // Frontmatter should be stripped from audio chunks
    assert.ok(!chunks[0].includes('---'));
    assert.ok(!chunks[0].includes('title: Test'));
  });

  it('handles fast start chunk splitting for sub-500ms initial response', () => {
    const longFirstPara = `Sentence one is short and punchy. Sentence two continues the long narrative describing the sprawling cyberpunk landscape of Night City across multiple lines.`;
    const chunks = splitIntoParagraphChunks(longFirstPara, 350);
    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0], 'Sentence one is short and punchy.');
  });

  it('strips markdown links, code tokens, and formatting while preserving dialogue text', () => {
    const markdownText = `# Chapter 1
Here is **bold** text and *italic* text with a [link](https://example.com) and \`code\` token.
"Keep the quotes intact!" said the speaker.`;

    const chunks = splitIntoParagraphChunks(markdownText, 350);
    assert.ok(chunks.length >= 1);
    assert.ok(!chunks[0].includes('#'));
    assert.ok(!chunks[0].includes('**'));
    assert.ok(!chunks[0].includes('https://example.com'));
    assert.ok(chunks[0].includes('bold text and italic text with a link and code token'));
    assert.ok(chunks.some((c) => c.includes('"Keep the quotes intact!" said the speaker.')));
  });
});
