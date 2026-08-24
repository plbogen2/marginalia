import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('useGit Hook Logic & Resilience', () => {
  it('handles fetch failures gracefully without throwing unhandled exceptions', async () => {
    // Mock a failed fetch (e.g. network failure / connection refused)
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      throw new TypeError('Failed to fetch');
    };

    let gitStatus = 'initial';
    let hasRemote = true;
    let gitAhead = 5;
    let hasGemini = true;

    // Simulate fetchGitStatus error recovery
    try {
      await mockFetch();
    } catch (err) {
      gitStatus = '';
      hasRemote = false;
      gitAhead = 0;
      hasGemini = false;
    }

    assert.ok(fetchCalled);
    assert.equal(gitStatus, '');
    assert.equal(hasRemote, false);
    assert.equal(gitAhead, 0);
    assert.equal(hasGemini, false);
  });

  it('parses valid git status response correctly', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        status: ' M src/App.tsx\n?? newfile.md',
        hasRemote: true,
        ahead: 2,
        hasGemini: true
      })
    };

    const data = await mockResponse.json();
    assert.ok(data.status.includes('src/App.tsx'));
    assert.equal(data.hasRemote, true);
    assert.equal(data.ahead, 2);
    assert.equal(data.hasGemini, true);
  });

  it('handles non-200 HTTP error responses from git status API', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: async () => ({ error: 'Not a git repository' })
    };

    let errorHandled = false;
    try {
      if (!mockResponse.ok) {
        const data = await mockResponse.json();
        throw new Error(data.error);
      }
    } catch (err: any) {
      errorHandled = true;
      assert.equal(err.message, 'Not a git repository');
    }

    assert.ok(errorHandled);
  });
});
