import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import fs from 'fs/promises';
import {
  DEFAULT_AUTH_SECRET,
  createSessionToken,
  deriveVfsSecret,
  getSessionSecret,
  getVfsMasterSecret,
} from './auth.js';
import { authMiddleware } from '../middleware/auth.js';
import { deps as vfsDeps } from './vfs.js';

describe('Auth Secret Separation & VFS Fail-Closed Middleware', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.SESSION_SECRET = process.env.SESSION_SECRET;
    originalEnv.VFS_SECRET = process.env.VFS_SECRET;
    originalEnv.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
    originalEnv.STORAGE_DIR = process.env.STORAGE_DIR;
  });

  afterEach(() => {
    for (const key of ['SESSION_SECRET', 'VFS_SECRET', 'GITHUB_CLIENT_ID', 'STORAGE_DIR']) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('prefers VFS_SECRET over SESSION_SECRET when deriving VFS key', () => {
    process.env.SESSION_SECRET = 'rotated_session_secret';
    process.env.VFS_SECRET = 'pinned_vfs_secret';

    assert.strictEqual(getSessionSecret(), 'rotated_session_secret');
    assert.strictEqual(getVfsMasterSecret(), 'pinned_vfs_secret');

    const expected = crypto.createHash('sha256').update('plbogen2:pinned_vfs_secret').digest('hex');
    assert.strictEqual(deriveVfsSecret('plbogen2'), expected);

    process.env.SESSION_SECRET = 'second_rotated_session_secret';
    assert.strictEqual(deriveVfsSecret('plbogen2'), expected);
  });

  it('falls back to SESSION_SECRET and then DEFAULT_AUTH_SECRET when VFS_SECRET is unset', () => {
    delete process.env.VFS_SECRET;
    process.env.SESSION_SECRET = 'legacy_session_secret';
    const expectedFromSession = crypto
      .createHash('sha256')
      .update('plbogen2:legacy_session_secret')
      .digest('hex');
    assert.strictEqual(deriveVfsSecret('plbogen2'), expectedFromSession);

    delete process.env.SESSION_SECRET;
    const expectedFromDefault = crypto
      .createHash('sha256')
      .update(`plbogen2:${DEFAULT_AUTH_SECRET}`)
      .digest('hex');
    assert.strictEqual(deriveVfsSecret('plbogen2'), expectedFromDefault);
  });

  it('fails closed with 503 on API requests when mountUserVfs fails', async () => {
    const tmpStorage = '/tmp/marginalia_auth_fail_closed_test/storage';
    await fs.rm('/tmp/marginalia_auth_fail_closed_test', { recursive: true, force: true });

    process.env.GITHUB_CLIENT_ID = 'test_client_id';
    process.env.SESSION_SECRET = 'session_secret_value';
    process.env.VFS_SECRET = 'wrong_vfs_secret';
    process.env.STORAGE_DIR = tmpStorage;

    const originalExec = vfsDeps.exec;
    const originalAvailable = vfsDeps.isGocryptfsAvailable;
    vfsDeps.isGocryptfsAvailable = async () => true;
    vfsDeps.exec = (async (cmd: string) => {
      if (cmd.startsWith('mountpoint')) {
        throw new Error('not mounted');
      }
      if (cmd.startsWith('gocryptfs')) {
        throw new Error('cipher: message authentication failed Password incorrect');
      }
      return { stdout: '', stderr: '' };
    }) as typeof vfsDeps.exec;

    try {
      const token = createSessionToken('plbogen2', process.env.SESSION_SECRET);
      let statusCode = 200;
      let jsonBody: unknown = null;
      let nextCalled = false;

      const req = {
        method: 'GET',
        path: '/api/files',
        headers: { cookie: `session_token=${token}` },
        accepts: () => 'json',
      } as any;
      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          jsonBody = payload;
          return this;
        },
      } as any;

      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(statusCode, 503);
      assert.deepStrictEqual(jsonBody, {
        error: 'Workspace storage unavailable: failed to mount encrypted VFS',
      });
    } finally {
      vfsDeps.exec = originalExec;
      vfsDeps.isGocryptfsAvailable = originalAvailable;
      await fs.rm('/tmp/marginalia_auth_fail_closed_test', { recursive: true, force: true });
    }
  });
});
