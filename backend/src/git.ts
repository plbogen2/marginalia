import { simpleGit, SimpleGit } from 'simple-git';
import os from 'os';
import { getTargetDir } from './config.js';
function getGitClient(req?: any): SimpleGit {
  return simpleGit({
    baseDir: getTargetDir(req),
    binary: 'git',
    maxConcurrentProcesses: 6,
  });
}

async function ensureGitUserConfig(req?: any): Promise<void> {
  const git = getGitClient(req);
  try {
    let systemUserRaw = '';
    let systemEmailRaw = '';

    if (req && req.user) {
      systemUserRaw = req.user;
      systemEmailRaw = `${req.user}@users.noreply.github.com`;
    } else {
      systemUserRaw = os.userInfo().username || process.env.USER || 'marginalia-user';
      const domain = os.hostname() || 'localhost';
      systemEmailRaw = `${systemUserRaw}@${domain}`;
    }

    const systemUser = systemUserRaw.replace(/[^a-zA-Z0-9_\-\.\s]/g, '');
    const systemEmail = systemEmailRaw.replace(/[^a-zA-Z0-9_\-\.\s@]/g, '');

    let hasName = false;
    try {
      const name = await git.getConfig('user.name', 'local');
      if (name.value && name.value.trim()) hasName = true;
    } catch (e) {
      // ignore
    }

    if (!hasName) {
      await git.addConfig('user.name', systemUser, false, 'local');
    }

    let hasEmail = false;
    try {
      const email = await git.getConfig('user.email', 'local');
      if (email.value && email.value.trim()) hasEmail = true;
    } catch (e) {
      // ignore
    }

    if (!hasEmail) {
      await git.addConfig('user.email', systemEmail, false, 'local');
    }
  } catch (err) {
    console.warn('Failed to ensure git user config:', err);
  }
}

export async function getGitStatus(req?: any): Promise<string> {
  const git = getGitClient(req);
  return git.raw(['status', '--porcelain']);
}

export async function gitCommit(message: string, req?: any): Promise<string> {
  await ensureGitUserConfig(req);
  const git = getGitClient(req);
  await git.add('.');
  const result = await git.commit(message);
  return `Commit successful: [${result.branch || 'main'} ${result.commit || ''}] ${message}`;
}

export async function gitPush(req?: any): Promise<string> {
  const git = getGitClient(req);
  const result = await git.push();
  return `Push successful: ${JSON.stringify(result)}`;
}

export async function gitPull(req?: any): Promise<string> {
  const git = getGitClient(req);
  const result = await git.pull();
  const files = result.files || [];
  return `Pulled changes. Files: ${files.join(', ')}`;
}

export async function getGitBranch(req?: any): Promise<string> {
  const git = getGitClient(req);
  const branch = await git.branchLocal();
  return branch.current;
}

import fs from 'fs/promises';
import path from 'path';

export async function cloneRepo(url: string, targetPath: string, accessToken?: string): Promise<string> {
  let cloneUrl = url.trim();
  if (accessToken) {
    if (cloneUrl.startsWith('https://github.com/')) {
      cloneUrl = cloneUrl.replace('https://github.com/', `https://x-access-token:${accessToken}@github.com/`);
    } else if (cloneUrl.startsWith('http://github.com/')) {
      cloneUrl = cloneUrl.replace('http://github.com/', `https://x-access-token:${accessToken}@github.com/`);
    } else if (cloneUrl.startsWith('git@github.com:')) {
      cloneUrl = cloneUrl.replace('git@github.com:', `https://x-access-token:${accessToken}@github.com/`);
    }
  }

  const result = await simpleGit().clone(cloneUrl, targetPath, [
    '--filter=blob:limit=10m',
    '--sparse'
  ]);

  try {
    const gitInfoDir = path.join(targetPath, '.git', 'info');
    await fs.mkdir(gitInfoDir, { recursive: true });
    const sparseRules = [
      '/*',
      '!*.exe',
      '!*.dll',
      '!*.so',
      '!*.dylib',
      '!*.bin',
      '!*.sh',
      '!*.bat',
      '!*.cmd',
      '!*.wasm',
      '!*.elf',
      '!*.zip',
      '!*.tar',
      '!*.gz',
      '!*.7z'
    ].join('\n');
    await fs.writeFile(path.join(gitInfoDir, 'sparse-checkout'), sparseRules, 'utf-8');

    const git = simpleGit(targetPath);
    await git.raw(['config', 'core.sparseCheckout', 'true']);
    await git.raw(['read-tree', '-mu', 'HEAD']);
  } catch (err) {
    console.warn('Failed to apply sparse checkout exclusion rules:', err);
  }

  return `Clone successful: ${result}`;
}

export async function hasGitRemote(req?: any): Promise<boolean> {
  const git = getGitClient(req);
  try {
    const remotes = await git.getRemotes();
    return remotes.length > 0;
  } catch (err) {
    return false;
  }
}

export async function getGitAheadCount(req?: any): Promise<number> {
  const git = getGitClient(req);
  try {
    await git.revparse(['--abbrev-ref', '@{u}']);
    const countStr = await git.raw(['rev-list', '--count', '@{u}..HEAD']);
    return parseInt(countStr.trim(), 10) || 0;
  } catch (err) {
    return 0;
  }
}

export async function getCommitDiff(req?: any): Promise<string> {
  const git = getGitClient(req);
  await git.add('.');
  return git.diff(['--cached']);
}

export async function gitShowHead(filePath: string, req?: any): Promise<string> {
  const git = getGitClient(req);
  try {
    return await git.show([`HEAD:${filePath}`]);
  } catch (err) {
    return '';
  }
}
