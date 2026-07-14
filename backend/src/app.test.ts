import test, { before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const TEST_TARGET_DIR = '/tmp/marginalia_app_test_target';
const TEST_REMOTE_DIR = '/tmp/marginalia_app_test_remote';

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

  // Create files that should be in initial commit
  await fs.writeFile(path.join(TEST_TARGET_DIR, 'init.txt'), 'init');
  await fs.writeFile(path.join(TEST_TARGET_DIR, 'chapter1.md'), 'Content of chapter 1');
  await fs.mkdir(path.join(TEST_TARGET_DIR, 'notes'), { recursive: true });
  await fs.writeFile(path.join(TEST_TARGET_DIR, 'notes/characters.md'), 'Character notes');

  await execAsync('git add .', { cwd: TEST_TARGET_DIR });
  await execAsync('git commit -m "initial"', { cwd: TEST_TARGET_DIR });
  await execAsync('git push -u origin master:main || git push -u origin main || git push -u origin master', { cwd: TEST_TARGET_DIR });

  // Create untracked files after initial commit
  await fs.writeFile(path.join(TEST_TARGET_DIR, 'ignored.txt'), 'Should be ignored');
});

after(async () => {
  await fs.rm(TEST_TARGET_DIR, { recursive: true, force: true });
  await fs.rm(TEST_REMOTE_DIR, { recursive: true, force: true });
});

test('Backend APIs', async (t) => {
  const { app } = await import('./app.js');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  await t.test('GET /api/health returns 200 and ok status', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { status: string };
    assert.deepStrictEqual(body, { status: 'ok' });
  });

  await t.test('GET /api/files lists only markdown files recursively', async () => {
    const res = await fetch(`http://localhost:${port}/api/files`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as string[];
    body.sort();
    assert.deepStrictEqual(body, ['chapter1.md', 'notes/characters.md']);
  });

  await t.test('GET /api/file reads content', async () => {
    const res = await fetch(`http://localhost:${port}/api/file?path=notes/characters.md`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { content: string };
    assert.strictEqual(body.content, 'Character notes');
  });

  await t.test('POST /api/file saves content', async () => {
    const res = await fetch(`http://localhost:${port}/api/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'chapter2.md', content: 'New chapter' })
    });
    assert.strictEqual(res.status, 200);
    
    const content = await fs.readFile(path.join(TEST_TARGET_DIR, 'chapter2.md'), 'utf-8');
    assert.strictEqual(content, 'New chapter');
  });

  await t.test('GET /api/git/status', async () => {
    // Modify chapter1.md
    await fs.writeFile(path.join(TEST_TARGET_DIR, 'chapter1.md'), 'Modified content');
    
    const res = await fetch(`http://localhost:${port}/api/git/status`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { status: string };
    assert.match(body.status, /M\s+chapter1\.md/);
    assert.match(body.status, /\?\?\s+chapter2\.md/); // Created in previous test
    assert.match(body.status, /\?\?\s+ignored\.txt/);  // Created in before hook
  });

  await t.test('POST /api/git/commit', async () => {
    const res = await fetch(`http://localhost:${port}/api/git/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update files' })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { result: string };
    assert.match(body.result, /Update files/);

    const statusRes = await fetch(`http://localhost:${port}/api/git/status`);
    const statusBody = await statusRes.json() as { status: string };
    assert.strictEqual(statusBody.status, '');
  });

  await t.test('POST /api/git/push', async () => {
    const res = await fetch(`http://localhost:${port}/api/git/push`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { result: string };
    assert.match(body.result, /marginalia_app_test_remote/);
  });

  await t.test('POST /api/git/pull', async () => {
    const tempClone = '/tmp/marginalia_app_test_clone';
    await fs.rm(tempClone, { recursive: true, force: true });
    await execAsync(`git clone ${TEST_REMOTE_DIR} ${tempClone}`);
    await execAsync('git config user.name "Test User"', { cwd: tempClone });
    await execAsync('git config user.email "test@example.com"', { cwd: tempClone });
    await fs.writeFile(path.join(tempClone, 'remote_change.txt'), 'remote');
    await execAsync('git add .', { cwd: tempClone });
    await execAsync('git commit -m "remote change"', { cwd: tempClone });
    await execAsync('git push', { cwd: tempClone });
    await fs.rm(tempClone, { recursive: true, force: true });

    const res = await fetch(`http://localhost:${port}/api/git/pull`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { result: string };
    assert.match(body.result, /remote_change\.txt/);
  });

  await t.test('GET /api/git/branch', async () => {
    const res = await fetch(`http://localhost:${port}/api/git/branch`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { branch: string };
    assert.match(body.branch, /^(main|master)$/);
  });

  await t.test('GET /api/workspaces returns active and recents from DB', async () => {
    const oldEnv = process.env.TARGET_DIR;
    delete process.env.TARGET_DIR;

    try {
      const { setTargetDir } = await import('./config.js');
      setTargetDir('/tmp/some_db_workspace');

      const res = await fetch(`http://localhost:${port}/api/workspaces`);
      assert.strictEqual(res.status, 200);
      const body = await res.json() as { active: string, recents: any[] };
      assert.strictEqual(body.active, '/tmp/some_db_workspace');
      assert.ok(body.recents.some(w => w.path === '/tmp/some_db_workspace'));
    } finally {
      process.env.TARGET_DIR = oldEnv;
    }
  });

  await t.test('POST /api/workspaces/select switches active workspace', async () => {
    const selectPath = '/tmp/marginalia_select_test';
    await fs.rm(selectPath, { recursive: true, force: true });
    await fs.mkdir(selectPath, { recursive: true });
    await execAsync('git init', { cwd: selectPath });

    const oldEnv = process.env.TARGET_DIR;
    delete process.env.TARGET_DIR;

    try {
      const res = await fetch(`http://localhost:${port}/api/workspaces/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectPath })
      });
      assert.strictEqual(res.status, 200);

      const { getTargetDir } = await import('./config.js');
      assert.strictEqual(getTargetDir(), selectPath);
    } finally {
      process.env.TARGET_DIR = oldEnv;
      await fs.rm(selectPath, { recursive: true, force: true });
    }
  });

  await t.test('POST /api/workspaces/clone clones repo and makes active', async () => {
    const clonePath = '/tmp/marginalia_clone_test';
    await fs.rm(clonePath, { recursive: true, force: true });

    const oldEnv = process.env.TARGET_DIR;
    delete process.env.TARGET_DIR;

    try {
      const res = await fetch(`http://localhost:${port}/api/workspaces/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: TEST_REMOTE_DIR, path: clonePath })
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json() as { result: string };
      assert.match(body.result, /Cloned successfully/);

      const gitExists = await fs.access(path.join(clonePath, '.git')).then(() => true).catch(() => false);
      assert.ok(gitExists);

      const { getTargetDir } = await import('./config.js');
      assert.strictEqual(getTargetDir(), clonePath);
    } finally {
      process.env.TARGET_DIR = oldEnv;
      await fs.rm(clonePath, { recursive: true, force: true });
    }
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
});
