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
  try {
    const { DB_PATH } = await import('./db.js');
    await fs.rm(DB_PATH, { force: true });
  } catch (err) {
    // ignore
  }
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

  await t.test('DELETE /api/file deletes file', async () => {
    const tempFile = path.join(TEST_TARGET_DIR, 'to_delete.md');
    await fs.writeFile(tempFile, 'Delete me');

    const res = await fetch(`http://localhost:${port}/api/file?path=to_delete.md`, {
      method: 'DELETE'
    });
    assert.strictEqual(res.status, 200);

    const exists = await fs.access(tempFile).then(() => true).catch(() => false);
    assert.ok(!exists);
  });

  await t.test('DELETE /api/file deletes directory recursively', async () => {
    const tempDir = path.join(TEST_TARGET_DIR, 'subfolder');
    const tempFile = path.join(tempDir, 'nested_delete.md');
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(tempFile, 'Nested delete me');

    const res = await fetch(`http://localhost:${port}/api/file?path=subfolder`, {
      method: 'DELETE'
    });
    assert.strictEqual(res.status, 200);

    const dirExists = await fs.access(tempDir).then(() => true).catch(() => false);
    assert.ok(!dirExists);
  });

  await t.test('GET /api/git/status', async () => {
    // Modify chapter1.md
    await fs.writeFile(path.join(TEST_TARGET_DIR, 'chapter1.md'), 'Modified content');
    
    const res = await fetch(`http://localhost:${port}/api/git/status`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { status: string, hasRemote: boolean, ahead: number, hasGemini: boolean };
    assert.match(body.status, /M\s+chapter1\.md/);
    assert.match(body.status, /\?\?\s+chapter2\.md/);
    assert.match(body.status, /\?\?\s+ignored\.txt/);
    assert.strictEqual(body.hasRemote, true);
    assert.strictEqual(body.ahead, 0);
    assert.strictEqual(typeof body.hasGemini, 'boolean');
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
    const statusBody = await statusRes.json() as { status: string, hasRemote: boolean, ahead: number };
    assert.strictEqual(statusBody.status, '');
    assert.strictEqual(statusBody.hasRemote, true);
    assert.strictEqual(statusBody.ahead, 1);
  });

  await t.test('POST /api/git/push', async () => {
    const res = await fetch(`http://localhost:${port}/api/git/push`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { result: string };
    assert.match(body.result, /marginalia_app_test_remote/);

    const statusRes = await fetch(`http://localhost:${port}/api/git/status`);
    const statusBody = await statusRes.json() as { ahead: number };
    assert.strictEqual(statusBody.ahead, 0);
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
      const body = await res.json() as { active: string, activeName: string, recents: any[] };
      assert.strictEqual(body.active, '/tmp/some_db_workspace');
      assert.strictEqual(body.activeName, 'some_db_workspace');
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
      const body = await res.json() as { status: string, path: string, name: string };
      assert.strictEqual(body.status, 'ok');
      assert.strictEqual(body.path, selectPath);
      assert.strictEqual(body.name, 'marginalia_select_test');

      const { getTargetDir } = await import('./config.js');
      assert.strictEqual(getTargetDir(), selectPath);
    } finally {
      process.env.TARGET_DIR = oldEnv;
      await fs.rm(selectPath, { recursive: true, force: true });
    }
  });

  await t.test('POST /api/workspaces/select-by-name switches active workspace', async () => {
    const testPath = '/tmp/marginalia_select_name_test';
    await fs.rm(testPath, { recursive: true, force: true });
    await fs.mkdir(testPath, { recursive: true });
    await execAsync('git init', { cwd: testPath });

    const oldEnv = process.env.TARGET_DIR;
    delete process.env.TARGET_DIR;

    try {
      await fetch(`http://localhost:${port}/api/workspaces/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: testPath })
      });

      const otherPath = '/tmp/marginalia_other_test';
      await fs.mkdir(otherPath, { recursive: true });
      await execAsync('git init', { cwd: otherPath });
      await fetch(`http://localhost:${port}/api/workspaces/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: otherPath })
      });

      const res = await fetch(`http://localhost:${port}/api/workspaces/select-by-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'marginalia_select_name_test' })
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json() as { status: string, path: string };
      assert.strictEqual(body.status, 'ok');
      assert.strictEqual(body.path, testPath);

      const { getTargetDir } = await import('./config.js');
      assert.strictEqual(getTargetDir(), testPath);

      await fs.rm(otherPath, { recursive: true, force: true });
    } finally {
      process.env.TARGET_DIR = oldEnv;
      await fs.rm(testPath, { recursive: true, force: true });
    }
  });

  await t.test('Security Hardening: Sandbox & Path Traversal Prevention', async (st) => {
    await st.test('GET /api/file rejects paths escaping the workspace', async () => {
      const res = await fetch(`http://localhost:${port}/api/file?path=../../../../etc/passwd`);
      assert.strictEqual(res.status, 403);
    });

    await st.test('POST /api/file rejects writing outside workspace', async () => {
      const res = await fetch(`http://localhost:${port}/api/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '../../escape.txt', content: 'hack' })
      });
      assert.strictEqual(res.status, 403);
    });

    await st.test('GET /api/file rejects sibling directory files', async () => {
      const oldEnv = process.env.TARGET_DIR;
      process.env.TARGET_DIR = '/tmp/marginalia_sandbox_test';
      await fs.mkdir(process.env.TARGET_DIR, { recursive: true });
      
      const siblingDir = '/tmp/marginalia_sandbox_test_sibling';
      await fs.mkdir(siblingDir, { recursive: true });
      await fs.writeFile(path.join(siblingDir, 'secret.txt'), 'private');

      try {
        const res = await fetch(`http://localhost:${port}/api/file?path=../marginalia_sandbox_test_sibling/secret.txt`);
        assert.strictEqual(res.status, 403);
      } finally {
        process.env.TARGET_DIR = oldEnv;
        await fs.rm('/tmp/marginalia_sandbox_test', { recursive: true, force: true });
        await fs.rm(siblingDir, { recursive: true, force: true });
      }
    });

    await st.test('POST /api/workspaces/select rejects system folders', async () => {
      const res = await fetch(`http://localhost:${port}/api/workspaces/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/etc' })
      });
      assert.strictEqual(res.status, 403);
    });
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
      const body = await res.json() as { status: string, result: string, path: string, name: string };
      assert.strictEqual(body.status, 'ok');
      assert.match(body.result, /Cloned successfully/);
      assert.strictEqual(body.path, clonePath);
      assert.strictEqual(body.name, 'marginalia_clone_test');

      const gitExists = await fs.access(path.join(clonePath, '.git')).then(() => true).catch(() => false);
      assert.ok(gitExists);

      const { getTargetDir } = await import('./config.js');
      assert.strictEqual(getTargetDir(), clonePath);
    } finally {
      process.env.TARGET_DIR = oldEnv;
      await fs.rm(clonePath, { recursive: true, force: true });
    }
  });

  await t.test('GET /api/fs/list lists only directories and filters hidden ones', async () => {
    const baseTestDir = '/tmp/marginalia_fs_test';
    await fs.rm(baseTestDir, { recursive: true, force: true });
    await fs.mkdir(baseTestDir, { recursive: true });
    
    await fs.mkdir(path.join(baseTestDir, 'dir1'), { recursive: true });
    await fs.mkdir(path.join(baseTestDir, 'dir2'), { recursive: true });
    await fs.mkdir(path.join(baseTestDir, '.hidden_dir'), { recursive: true });
    await fs.writeFile(path.join(baseTestDir, 'file1.txt'), 'hello');

    try {
      const res = await fetch(`http://localhost:${port}/api/fs/list?path=${encodeURIComponent(baseTestDir)}`);
      assert.strictEqual(res.status, 200);
      const body = await res.json() as { path: string, directories: { name: string, path: string }[] };
      
      assert.strictEqual(body.path, baseTestDir);
      assert.strictEqual(body.directories.length, 2);
      const names = body.directories.map(i => i.name).sort();
      assert.deepStrictEqual(names, ['dir1', 'dir2']);
      
      assert.strictEqual(body.directories[0].path, path.join(baseTestDir, body.directories[0].name));
    } finally {
      await fs.rm(baseTestDir, { recursive: true, force: true });
    }
  });

  await t.test('GET /api/git/status returns hasRemote: false if no remote', async () => {
    const noRemotePath = '/tmp/marginalia_no_remote_test';
    await fs.rm(noRemotePath, { recursive: true, force: true });
    await fs.mkdir(noRemotePath, { recursive: true });
    await execAsync('git init', { cwd: noRemotePath });

    const oldEnv = process.env.TARGET_DIR;
    delete process.env.TARGET_DIR;

    try {
      const { setTargetDir } = await import('./config.js');
      setTargetDir(noRemotePath);

      const res = await fetch(`http://localhost:${port}/api/git/status`);
      assert.strictEqual(res.status, 200);
      const body = await res.json() as { status: string, hasRemote: boolean };
      assert.strictEqual(body.hasRemote, false);
    } finally {
      process.env.TARGET_DIR = oldEnv;
      await fs.rm(noRemotePath, { recursive: true, force: true });
    }
  });
  await t.test('POST /api/git/suggest-commit-message returns 400 if API key missing', async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const res = await fetch(`http://localhost:${port}/api/git/suggest-commit-message`, {
        method: 'POST'
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json() as { error: string };
      assert.match(body.error, /GEMINI_API_KEY is not configured/);
    } finally {
      process.env.GEMINI_API_KEY = oldKey;
    }
  });

  await t.test('Configuration Settings APIs (Gemini Key & Simulation Mode)', async (st) => {
    const oldKey = process.env.GEMINI_API_KEY;
    const oldClientId = process.env.GITHUB_CLIENT_ID;
    const oldClientSecret = process.env.GITHUB_CLIENT_SECRET;
    const oldAllowed = process.env.ALLOWED_USER;
    
    delete process.env.GEMINI_API_KEY;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.ALLOWED_USER;

    try {
      const res1 = await fetch(`http://localhost:${port}/api/config`);
      assert.strictEqual(res1.status, 200);
      const body1 = await res1.json() as { 
        hasGemini: boolean;
        simulateHostedMode: boolean;
        githubClientId: string;
        hasGithubSecret: boolean;
        allowedUser: string;
        geminiModel: string;
      };
      assert.strictEqual(body1.hasGemini, false);
      assert.strictEqual(body1.simulateHostedMode, false);
      assert.strictEqual(body1.githubClientId, '');
      assert.strictEqual(body1.hasGithubSecret, false);
      assert.strictEqual(body1.allowedUser, '');
      assert.strictEqual(body1.geminiModel, 'gemini-1.5-flash');

      const res2 = await fetch(`http://localhost:${port}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          geminiApiKey: 'test_dummy_key_value', 
          simulateHostedMode: true,
          githubClientId: 'my-custom-client-id',
          githubClientSecret: 'my-custom-client-secret',
          allowedUser: 'my-whitelisted-user',
          geminiModel: 'gemini-2.0-pro-exp'
        })
      });
      assert.strictEqual(res2.status, 200);
      const body2 = await res2.json() as { status: string };
      assert.strictEqual(body2.status, 'ok');

      const res3 = await fetch(`http://localhost:${port}/api/config`);
      const body3 = await res3.json() as { 
        hasGemini: boolean;
        simulateHostedMode: boolean;
        githubClientId: string;
        hasGithubSecret: boolean;
        allowedUser: string;
        geminiModel: string;
      };
      assert.strictEqual(body3.hasGemini, true);
      assert.strictEqual(body3.simulateHostedMode, true);
      assert.strictEqual(body3.githubClientId, 'my-custom-client-id');
      assert.strictEqual(body3.hasGithubSecret, true);
      assert.strictEqual(body3.allowedUser, 'my-whitelisted-user');
      assert.strictEqual(body3.geminiModel, 'gemini-2.0-pro-exp');

      const res4 = await fetch(`http://localhost:${port}/api/git/suggest-commit-message`, {
        method: 'POST'
      });
      assert.notStrictEqual(res4.status, 400);

      const { db } = await import('./db.js');
      db.prepare("DELETE FROM settings WHERE key IN ('gemini_api_key', 'simulate_hosted_mode', 'github_client_id', 'github_client_secret', 'allowed_user', 'gemini_model');").run();
    } finally {
      process.env.GEMINI_API_KEY = oldKey;
      if (oldClientId) process.env.GITHUB_CLIENT_ID = oldClientId;
      if (oldClientSecret) process.env.GITHUB_CLIENT_SECRET = oldClientSecret;
      if (oldAllowed) process.env.ALLOWED_USER = oldAllowed;
    }
  });

  await t.test('Dictionary and LanguageTool Proxy APIs', async () => {
    const testText = "This is a misspelledwordok.";
    const checkRes1 = await fetch(`http://localhost:${port}/api/languagetool/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText })
    });
    assert.strictEqual(checkRes1.status, 200);
    const checkBody1 = await checkRes1.json() as { matches: any[] };
    const spellingMistakes1 = checkBody1.matches.filter(m => m.rule?.issueType === 'misspelling');
    assert.ok(spellingMistakes1.length > 0);

    const addRes = await fetch(`http://localhost:${port}/api/dictionary/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: 'misspelledwordok', scope: 'global' })
    });
    assert.strictEqual(addRes.status, 200);

    const dictRes = await fetch(`http://localhost:${port}/api/dictionary`);
    assert.strictEqual(dictRes.status, 200);
    const dictBody = await dictRes.json() as { global: string[], workspace: string[] };
    assert.ok(dictBody.global.includes('misspelledwordok'));

    const checkRes2 = await fetch(`http://localhost:${port}/api/languagetool/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText })
    });
    assert.strictEqual(checkRes2.status, 200);
    const checkBody2 = await checkRes2.json() as { matches: any[] };
    const spellingMistakes2 = checkBody2.matches.filter(m => m.rule?.issueType === 'misspelling');
    assert.strictEqual(spellingMistakes2.length, 0);

    // Workspace dictionary test
    const workspaceWord = "testworkspaceignoredword";
    const testTextWorkspace = `This is a ${workspaceWord}.`;

    const checkWS1 = await fetch(`http://localhost:${port}/api/languagetool/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testTextWorkspace })
    });
    const checkWSBody1 = await checkWS1.json() as { matches: any[] };
    assert.ok(checkWSBody1.matches.some(m => m.rule?.issueType === 'misspelling'));

    const addWSRes = await fetch(`http://localhost:${port}/api/dictionary/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: workspaceWord, scope: 'workspace' })
    });
    assert.strictEqual(addWSRes.status, 200);

    const dictFilePath = path.join(TEST_TARGET_DIR, '.marginalia', 'dictionary.json');
    const dictFileContent = await fs.readFile(dictFilePath, 'utf-8');
    const words = JSON.parse(dictFileContent) as string[];
    assert.ok(words.includes(workspaceWord));

    const dictRes2 = await fetch(`http://localhost:${port}/api/dictionary`);
    const dictBody2 = await dictRes2.json() as { global: string[], workspace: string[] };
    assert.ok(dictBody2.workspace.includes(workspaceWord));

    const checkWS2 = await fetch(`http://localhost:${port}/api/languagetool/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testTextWorkspace })
    });
    const checkWSBody2 = await checkWS2.json() as { matches: any[] };
    const spellingMistakesWS2 = checkWSBody2.matches.filter(m => m.rule?.issueType === 'misspelling');
    assert.strictEqual(spellingMistakesWS2.length, 0);

    await fs.rm(dictFilePath, { force: true });
  });

  await t.test('Optional GitHub OAuth & VFS Sandbox', async (st) => {
    await st.test('GET /api/auth/status in Local Mode returns loggedIn: true', async () => {
      const res = await fetch(`http://localhost:${port}/api/auth/status`);
      assert.strictEqual(res.status, 200);
      const body = await res.json() as { loggedIn: boolean, isOAuthMode: boolean };
      assert.strictEqual(body.loggedIn, true);
      assert.strictEqual(body.isOAuthMode, false);
    });

    await st.test('Hosted Mode restricts access without session token', async () => {
      const oldClientId = process.env.GITHUB_CLIENT_ID;
      process.env.GITHUB_CLIENT_ID = 'test_github_client_id';

      try {
        const statusRes = await fetch(`http://localhost:${port}/api/auth/status`);
        const statusBody = await statusRes.json() as { loggedIn: boolean, isOAuthMode: boolean };
        assert.strictEqual(statusBody.loggedIn, false);
        assert.strictEqual(statusBody.isOAuthMode, true);

        const filesRes = await fetch(`http://localhost:${port}/api/files`);
        assert.strictEqual(filesRes.status, 401);
      } finally {
        if (oldClientId === undefined) {
          delete process.env.GITHUB_CLIENT_ID;
        } else {
          process.env.GITHUB_CLIENT_ID = oldClientId;
        }
      }
    });

    await st.test('Accessing file with valid session token is sandboxed to user directory', async () => {
      const oldClientId = process.env.GITHUB_CLIENT_ID;
      const oldSecret = process.env.SESSION_SECRET;
      const oldStorage = process.env.STORAGE_DIR;

      process.env.GITHUB_CLIENT_ID = 'test_github_client_id';
      process.env.SESSION_SECRET = 'test_session_secret_for_signing_tokens';
      process.env.STORAGE_DIR = '/tmp/marginalia_oauth_vfs_test';

      const user = 'plbogen';
      const userSandbox = path.join(process.env.STORAGE_DIR, user);
      await fs.mkdir(userSandbox, { recursive: true });

      const testWorkspace = path.join(userSandbox, 'my-sandbox-workspace');
      await fs.mkdir(testWorkspace, { recursive: true });
      
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('git init', { cwd: testWorkspace });
      await fs.writeFile(path.join(testWorkspace, 'chapter1.md'), '# Chapter 1 inside VFS');

      const { createSessionToken } = await import('./utils/auth.js');
      const token = createSessionToken(user, process.env.SESSION_SECRET);

      try {
        const selectRes = await fetch(`http://localhost:${port}/api/workspaces/select`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `session_token=${token}`
          },
          body: JSON.stringify({ path: testWorkspace })
        });
        assert.strictEqual(selectRes.status, 200);

        const fileRes = await fetch(`http://localhost:${port}/api/file?path=chapter1.md`, {
          headers: {
            'Cookie': `session_token=${token}`
          }
        });
        assert.strictEqual(fileRes.status, 200);
        const fileData = await fileRes.json() as { content: string };
        assert.strictEqual(fileData.content, '# Chapter 1 inside VFS');

        const badFileRes = await fetch(`http://localhost:${port}/api/file?path=../../../../etc/passwd`, {
          headers: {
            'Cookie': `session_token=${token}`
          }
        });
        assert.strictEqual(badFileRes.status, 403);
      } finally {
        if (oldClientId === undefined) delete process.env.GITHUB_CLIENT_ID;
        else process.env.GITHUB_CLIENT_ID = oldClientId;

        if (oldSecret === undefined) delete process.env.SESSION_SECRET;
        else process.env.SESSION_SECRET = oldSecret;

        if (oldStorage === undefined) delete process.env.STORAGE_DIR;
        else process.env.STORAGE_DIR = oldStorage;

        await fs.rm('/tmp/marginalia_oauth_vfs_test', { recursive: true, force: true });
      }
    });
  });

  await t.test('AI Editor Analysis APIs', async (st) => {
    await st.test('POST /api/ai/analyze returns 400 when missing path or persona', async () => {
      const res = await fetch(`http://localhost:${port}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'chapter1.md' })
      });
      assert.strictEqual(res.status, 400);
    });

    await st.test('POST /api/ai/analyze returns 403 for path traversal attempt', async () => {
      const res = await fetch(`http://localhost:${port}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '../../etc/passwd', persona: 'developmental' })
      });
      assert.strictEqual(res.status, 403);
    });

    await st.test('POST /api/ai/analyze returns 400 for invalid persona', async () => {
      const res = await fetch(`http://localhost:${port}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'chapter1.md', persona: 'invalid-persona' })
      });
      assert.strictEqual(res.status, 400);
    });

    await st.test('GET and POST /api/ai/cache manages session cache details', async () => {
      const getRes = await fetch(`http://localhost:${port}/api/ai/cache?path=chapter1.md&persona=developmental`);
      assert.strictEqual(getRes.status, 200);
      const getBody = await getRes.json() as { messages: any[] };
      assert.deepStrictEqual(getBody.messages, []);

      const sampleMessages = [{ id: '1', role: 'model', content: 'Cached advice' }];
      const postRes = await fetch(`http://localhost:${port}/api/ai/cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'chapter1.md',
          persona: 'developmental',
          messages: sampleMessages
        })
      });
      assert.strictEqual(postRes.status, 200);

      const getRes2 = await fetch(`http://localhost:${port}/api/ai/cache?path=chapter1.md&persona=developmental`);
      assert.strictEqual(getRes2.status, 200);
      const getBody2 = await getRes2.json() as { messages: any[] };
      assert.strictEqual(getBody2.messages.length, 1);
      assert.strictEqual(getBody2.messages[0].content, 'Cached advice');
    });
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
});
