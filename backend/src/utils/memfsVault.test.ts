import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  encryptPayload,
  decryptPayload,
  setInMemoryFile,
  getInMemoryFile,
  loadUserVaultFromDisk,
  saveUserVaultToDisk,
  removeInMemoryUser,
} from './memfsVault.js';
import crypto from 'crypto';

describe('In-Memory AES-256-GCM Encrypted Vault', () => {
  const secretKey = 'test_secret_passphrase_key_123';
  const username = 'alice_test';
  const key = crypto.scryptSync(secretKey, `marginalia_salt_${username}`, 32);

  it('encrypts and decrypts buffer payloads cleanly with AES-256-GCM', () => {
    const originalText = Buffer.from('Chapter 1: The Secret Manuscript of Eloria', 'utf-8');
    const encrypted = encryptPayload(originalText, key);

    assert.ok(encrypted.iv);
    assert.ok(encrypted.authTag);
    assert.ok(encrypted.data);

    const decrypted = decryptPayload(encrypted, key);
    assert.strictEqual(decrypted.toString('utf-8'), 'Chapter 1: The Secret Manuscript of Eloria');
  });

  it('manages in-memory files per user without touching disk OS mounts', () => {
    setInMemoryFile(username, 'chapter1.md', '# Chapter 1\nIt was a dark night.');
    const content = getInMemoryFile(username, 'chapter1.md');
    assert.strictEqual(content, '# Chapter 1\nIt was a dark night.');
  });

  it('saves and loads encrypted vault to disk', async () => {
    setInMemoryFile(username, 'chapter2.md', '# Chapter 2\nThe journey begins.');
    await saveUserVaultToDisk(username, secretKey);

    removeInMemoryUser(username);
    assert.strictEqual(getInMemoryFile(username, 'chapter2.md'), null);

    const loadedMap = await loadUserVaultFromDisk(username, secretKey);
    assert.strictEqual(loadedMap.get('chapter2.md'), '# Chapter 2\nThe journey begins.');
  });
});
