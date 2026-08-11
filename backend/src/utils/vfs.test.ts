import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  isGocryptfsAvailable, 
  isVfsMounted, 
  mountUserVfs, 
  unmountUserVfs,
  deps,
  getEncryptedStorageDir,
  getUserMountDir
} from './vfs.js';
import fs from 'fs/promises';
import path from 'path';

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

  describe('mountUserVfs with mocked exec', () => {
    let originalExec: typeof deps.exec;
    let originalAvailable: typeof deps.isGocryptfsAvailable;
    let execCalls: string[] = [];

    beforeEach(() => {
      originalExec = deps.exec;
      originalAvailable = deps.isGocryptfsAvailable;
      execCalls = [];
      
      // Mock exec to just record calls and return success
      deps.exec = (async (cmd: string) => {
        execCalls.push(cmd);
        return { stdout: '', stderr: '' };
      }) as any;

      // Force gocryptfs to be "available"
      deps.isGocryptfsAvailable = async () => true;
    });

    afterEach(async () => {
      deps.exec = originalExec;
      deps.isGocryptfsAvailable = originalAvailable;
      
      // Clean up any test user dirs
      const encDirInit = getEncryptedStorageDir('test_user_init');
      const mountDirInit = getUserMountDir('test_user_init');
      await fs.rm(encDirInit, { recursive: true, force: true });
      await fs.rm(mountDirInit, { recursive: true, force: true });

      const encDirNoInit = getEncryptedStorageDir('test_user_no_init');
      const mountDirNoInit = getUserMountDir('test_user_no_init');
      await fs.rm(encDirNoInit, { recursive: true, force: true });
      await fs.rm(mountDirNoInit, { recursive: true, force: true });
    });

    it('initializes and mounts VFS if config is missing', async () => {
      const username = 'test_user_init';
      const secretKey = 'secret_123';
      
      await mountUserVfs(username, secretKey);

      // Verify exec calls
      assert.strictEqual(execCalls.length, 3);
      assert.match(execCalls[0], /mountpoint/);
      assert.match(execCalls[1], /gocryptfs -init -extpass/);
      assert.match(execCalls[2], /gocryptfs -extpass/);
      
      // Verify temp password file was deleted
      const tempPassFilePattern = new RegExp(`vfs-${username}\\.pass`);
      assert.match(execCalls[1], tempPassFilePattern);
      
      // Try to find the temp file path from the command
      const match = execCalls[1].match(/cat ([^"]+)/);
      if (match && match[1]) {
        const passfilePath = match[1];
        try {
          await fs.access(passfilePath);
          assert.fail('Password file was not deleted');
        } catch (err) {
          assert.strictEqual((err as any).code, 'ENOENT');
        }
      } else {
        assert.fail('Could not extract passfile path from command');
      }
    });

    it('mounts VFS without initializing if config already exists', async () => {
      const username = 'test_user_no_init';
      const secretKey = 'secret_123';
      
      // Pre-create gocryptfs.conf
      const encDir = getEncryptedStorageDir(username);
      await fs.mkdir(encDir, { recursive: true });
      await fs.writeFile(path.join(encDir, 'gocryptfs.conf'), 'mock config');

      await mountUserVfs(username, secretKey);

      // Verify exec calls (only mount, no init)
      assert.strictEqual(execCalls.length, 2);
      assert.match(execCalls[0], /mountpoint/);
      assert.match(execCalls[1], /gocryptfs -extpass/);
      assert.doesNotMatch(execCalls[1], /-init/);
    });
  });
});
