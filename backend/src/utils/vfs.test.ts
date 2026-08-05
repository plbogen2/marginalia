import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isGocryptfsAvailable, isVfsMounted, mountUserVfs, unmountUserVfs } from './vfs.js';

describe('VFS Utility Module', () => {
  it('checks gocryptfs availability without throwing', async () => {
    const available = await isGocryptfsAvailable();
    assert.strictEqual(typeof available, 'boolean');
  });

  it('checks vfs mount status without throwing', async () => {
    const mounted = await isVfsMounted('test_user');
    assert.strictEqual(typeof mounted, 'boolean');
  });

  it('handles mount and unmount gracefully when gocryptfs is unavailable or in test mode', async () => {
    await mountUserVfs('test_user', 'test_secret_key_123');
    await unmountUserVfs('test_user');
    assert.ok(true);
  });
});
