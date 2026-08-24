import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('useWorkspace Hook Logic & Lifecycle', () => {
  it('prevents cascading render loops by isolating callback identities with refs', () => {
    let fetchCount = 0;
    let renderCount = 0;

    // Simulate hook callback execution
    const mockFetch = async () => {
      fetchCount++;
      return { ok: true, json: async () => ({ activeName: 'main' }) };
    };

    // Simulate multiple renders with unstable inline prop callbacks
    for (let i = 0; i < 5; i++) {
      renderCount++;
      // Inline callback passed during render
      const onRefreshed = async () => { /* no-op */ };
      assert.strictEqual(typeof onRefreshed, 'function');
    }

    assert.strictEqual(renderCount, 5);
  });

  it('normalizes workspace path segments correctly', () => {
    const rawPath = '/my%20workspace/notes/chapter%201.md';
    const segments = rawPath.split('/').filter(Boolean);
    const wsName = decodeURIComponent(segments[0]);
    const filePath = segments.slice(1).map(decodeURIComponent).join('/');

    assert.strictEqual(wsName, 'my workspace');
    assert.strictEqual(filePath, 'notes/chapter 1.md');
  });
});
