import test, { before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);
const TEST_TARGET_DIR = '/tmp/marginalia_git_test_target';
const TEST_REMOTE_DIR = '/tmp/marginalia_git_test_remote';

before(async () => {
  await fs.rm(TEST_TARGET_DIR, { recursive: true, force: true });
  await fs.rm(TEST_REMOTE_DIR, { recursive: true, force: true });

  await fs.mkdir(TEST_TARGET_DIR, { recursive: true });
  await fs.mkdir(TEST_REMOTE_DIR, { recursive: true });

  process.env.TARGET_DIR = TEST_TARGET_DIR;

  await execAsync('git init --bare', { cwd: TEST_REMOTE_DIR });
  await execAsync('git init', { cwd: TEST_TARGET_DIR });
  await execAsync('git config user.name "Test User"', { cwd: TEST_TARGET_DIR });
  await execAsync('git config user.email "test@example.com"', { cwd: TEST_TARGET_DIR });
  await execAsync(`git remote add origin ${TEST_REMOTE_DIR}`, { cwd: TEST_TARGET_DIR });

  await fs.writeFile(path.join(TEST_TARGET_DIR, 'init.txt'), 'init');
  await execAsync('git add .', { cwd: TEST_TARGET_DIR });
  await execAsync('git commit -m "initial"', { cwd: TEST_TARGET_DIR });
  await execAsync('git push -u origin master:main || git push -u origin main || git push -u origin master', { cwd: TEST_TARGET_DIR });
});

after(async () => {
  await fs.rm(TEST_TARGET_DIR, { recursive: true, force: true });
  await fs.rm(TEST_REMOTE_DIR, { recursive: true, force: true });
});

test('Git Helpers', async (t) => {
  const { getGitStatus, gitCommit, gitPush, gitPull } = await import('./git.js');

  await t.test('getGitStatus detects untracked file', async () => {
    await fs.writeFile(path.join(TEST_TARGET_DIR, 'newfile.md'), 'new');
    const status = await getGitStatus();
    assert.match(status, /\?\?\s+newfile\.md/);
  });

  await t.test('gitCommit commits changes', async () => {
    const commitResult = await gitCommit('Add newfile');
    assert.match(commitResult, /Add newfile/); // match part of commit output
    
    const status = await getGitStatus();
    assert.strictEqual(status, '');
  });

  await t.test('gitCommit auto-configures user name and email if unset', async () => {
    // 1. Create simulated user storage directory
    const userStorageRoot = path.join(TEST_TARGET_DIR, 'github-test-user');
    await fs.mkdir(userStorageRoot, { recursive: true });
    await execAsync('git init', { cwd: userStorageRoot });
    await fs.writeFile(path.join(userStorageRoot, 'testfile.md'), 'hello');

    // Set STORAGE_DIR to point to our test folder so getUserStorageRoot resolves here
    const originalStorageDir = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = TEST_TARGET_DIR;

    try {
      await execAsync('git config --local --unset user.name', { cwd: userStorageRoot });
    } catch (e) { /* ignore */ }
    
    try {
      await execAsync('git config --local --unset user.email', { cwd: userStorageRoot });
    } catch (e) { /* ignore */ }

    const mockReq = { user: 'github-test-user' };
    const commitResult = await gitCommit('Test auto config in Hosted Mode', mockReq);
    assert.match(commitResult, /Test auto config in Hosted Mode/);

    const { stdout: name } = await execAsync('git config user.name', { cwd: userStorageRoot });
    const { stdout: email } = await execAsync('git config user.email', { cwd: userStorageRoot });

    assert.strictEqual(name.trim(), 'github-test-user');
    assert.strictEqual(email.trim(), 'github-test-user@users.noreply.github.com');

    // Clean up
    if (originalStorageDir) {
      process.env.STORAGE_DIR = originalStorageDir;
    } else {
      delete process.env.STORAGE_DIR;
    }
    await fs.rm(userStorageRoot, { recursive: true, force: true });
  });

  await t.test('gitCommit auto-configures user name and email in Local Mode using system defaults', async () => {
    try {
      await execAsync('git config --local --unset user.name', { cwd: TEST_TARGET_DIR });
    } catch (e) { /* ignore */ }
    
    try {
      await execAsync('git config --local --unset user.email', { cwd: TEST_TARGET_DIR });
    } catch (e) { /* ignore */ }

    await fs.writeFile(path.join(TEST_TARGET_DIR, 'newfile.md'), 'some local mode content');

    const commitResult = await gitCommit('Test local mode auto config');
    assert.match(commitResult, /Test local mode auto config/);

    const { stdout: name } = await execAsync('git config user.name', { cwd: TEST_TARGET_DIR });
    const { stdout: email } = await execAsync('git config user.email', { cwd: TEST_TARGET_DIR });

    const expectedUserRaw = os.userInfo().username || process.env.USER || 'marginalia-user';
    const expectedUser = expectedUserRaw.replace(/[^a-zA-Z0-9_\-\.\s]/g, '');
    const expectedDomain = os.hostname() || 'localhost';
    const expectedEmail = `${expectedUser}@${expectedDomain}`.replace(/[^a-zA-Z0-9_\-\.\s@]/g, '');

    assert.strictEqual(name.trim(), expectedUser);
    assert.strictEqual(email.trim(), expectedEmail);
  });

  await t.test('gitPush pushes to remote', async () => {
    const pushResult = await gitPush();
    // Git push output often goes to stderr, which we merge in runGit
    assert.match(pushResult, /marginalia_git_test_remote/);
  });

  await t.test('gitPull pulls from remote', async () => {
    const tempClone = '/tmp/marginalia_git_test_clone';
    await fs.rm(tempClone, { recursive: true, force: true });
    await execAsync(`git clone ${TEST_REMOTE_DIR} ${tempClone}`);
    await execAsync('git config user.name "Test User"', { cwd: tempClone });
    await execAsync('git config user.email "test@example.com"', { cwd: tempClone });
    await fs.writeFile(path.join(tempClone, 'remote_change.txt'), 'remote');
    await execAsync('git add .', { cwd: tempClone });
    await execAsync('git commit -m "remote change"', { cwd: tempClone });
    await execAsync('git push', { cwd: tempClone });
    await fs.rm(tempClone, { recursive: true, force: true });

    const pullResult = await gitPull();
    assert.match(pullResult, /remote_change\.txt/);
    
    const fileExists = await fs.access(path.join(TEST_TARGET_DIR, 'remote_change.txt')).then(() => true).catch(() => false);
    assert.ok(fileExists);
  });
});
