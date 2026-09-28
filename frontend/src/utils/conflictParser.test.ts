import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConflictMarkers, resolveConflictsInContent } from './conflictParser.js';

describe('conflictParser Utility', () => {
  it('detects no conflicts when text has no markers', () => {
    const text = 'Line 1\nLine 2\nLine 3\n';
    const result = parseConflictMarkers(text);
    assert.equal(result.hasConflicts, false);
    assert.equal(result.blocks.length, 0);
  });

  it('correctly parses standard 2-way conflict markers', () => {
    const text = `Start of file
<<<<<<< HEAD
Current local edits
=======
Incoming remote edits
>>>>>>> branch-or-commit
End of file`;

    const result = parseConflictMarkers(text);
    assert.equal(result.hasConflicts, true);
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].currentText, 'Current local edits\n');
    assert.equal(result.blocks[0].incomingText, 'Incoming remote edits\n');
    assert.equal(result.blocks[0].baseText, undefined);
  });

  it('correctly parses 3-way (diff3) conflict markers', () => {
    const text = `Before
<<<<<<< HEAD
Our version
||||||| merged common ancestors
Original base version
=======
Their version
>>>>>>> remote
After`;

    const result = parseConflictMarkers(text);
    assert.equal(result.hasConflicts, true);
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].currentText, 'Our version\n');
    assert.equal(result.blocks[0].baseText, 'Original base version\n');
    assert.equal(result.blocks[0].incomingText, 'Their version\n');
  });

  it('resolves conflicts choosing current, incoming, and both', () => {
    const text = `Start
<<<<<<< HEAD
Current A
=======
Incoming A
>>>>>>> origin/main
Middle
<<<<<<< HEAD
Current B
=======
Incoming B
>>>>>>> origin/main
End`;

    // 1. Keep Current for block 1, Incoming for block 2
    const res1 = resolveConflictsInContent(text, {
      'conflict-1': 'current',
      'conflict-2': 'incoming',
    });
    assert.equal(res1, `Start
Current A
Middle
Incoming B
End`);

    // 2. Keep Both for block 1, Current for block 2
    const res2 = resolveConflictsInContent(text, {
      'conflict-1': 'both',
      'conflict-2': 'current',
    });
    assert.equal(res2, `Start
Current A
Incoming A
Middle
Current B
End`);
  });
});
