import test, { before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

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
