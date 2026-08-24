import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from './aiParser.js';

describe('aiParser Utility', () => {
  it('parses basic assistant message without thinking or suggestions', () => {
    const raw = 'This is a straightforward message from the model.';
    const msg = parseMessage(raw, 'msg-1');

    assert.equal(msg.id, 'msg-1');
    assert.equal(msg.role, 'model');
    assert.equal(msg.content, 'This is a straightforward message from the model.');
    assert.equal(msg.rawContent, raw);
    assert.equal(msg.thinking, undefined);
    assert.equal(msg.suggestions.length, 0);
  });

  it('extracts <thinking> tags and separates them from display content', () => {
    const raw = `<thinking>
I should explain the cyberpunk aesthetic and provide a suggestion.
</thinking>
Here is the improved text for the scene.`;
    const msg = parseMessage(raw, 'msg-2');

    assert.equal(msg.thinking, 'I should explain the cyberpunk aesthetic and provide a suggestion.');
    assert.equal(msg.content, 'Here is the improved text for the scene.');
    assert.equal(msg.rawContent, raw);
  });

  it('extracts search/replace diff suggestion blocks', () => {
    const raw = `I suggest replacing the opening paragraph:
<<<<
The sky was blue and clear.
====
The sky above the port was the color of television, tuned to a dead channel.
>>>>
Let me know what you think!`;

    const msg = parseMessage(raw, 'msg-3');

    assert.equal(msg.suggestions.length, 1);
    assert.equal(msg.suggestions[0].id, 'msg-3-suggest-0');
    assert.equal(msg.suggestions[0].original, 'The sky was blue and clear.');
    assert.equal(msg.suggestions[0].replacement, 'The sky above the port was the color of television, tuned to a dead channel.');
    assert.equal(msg.suggestions[0].applied, false);
    assert.ok(msg.content.includes('I suggest replacing the opening paragraph:'));
    assert.ok(msg.content.includes('Let me know what you think!'));
    assert.ok(!msg.content.includes('<<<<'));
  });

  it('handles multiple suggestion blocks in a single message', () => {
    const raw = `Multiple edits:
<<<<
Line 1
====
Fixed Line 1
>>>>
Some intermediate text
<<<<
Line 2
====
Fixed Line 2
>>>>`;

    const msg = parseMessage(raw, 'msg-4');
    assert.equal(msg.suggestions.length, 2);
    assert.equal(msg.suggestions[0].original, 'Line 1');
    assert.equal(msg.suggestions[0].replacement, 'Fixed Line 1');
    assert.equal(msg.suggestions[1].original, 'Line 2');
    assert.equal(msg.suggestions[1].replacement, 'Fixed Line 2');
  });
});
