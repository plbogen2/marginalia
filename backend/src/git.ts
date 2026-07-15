import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { getTargetDir } from './config.js';

const execAsync = promisify(exec);

async function runGit(args: string[], req?: any): Promise<string> {
  const cmd = `git ${args.join(' ')}`;
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: getTargetDir(req) });
    return (stdout + '\n' + stderr).trim();
  } catch (err) {
    throw new Error(`Git command failed: ${cmd}\nError: ${(err as Error).message}`);
  }
}

async function ensureGitUserConfig(req?: any): Promise<void> {
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
      const name = await runGit(['config', 'user.name'], req);
      if (name.trim()) hasName = true;
    } catch (e) {
      // ignore
    }

    if (!hasName) {
      await runGit(['config', 'user.name', `"${systemUser}"`], req);
    }

    let hasEmail = false;
    try {
      const email = await runGit(['config', 'user.email'], req);
      if (email.trim()) hasEmail = true;
    } catch (e) {
      // ignore
    }

    if (!hasEmail) {
      await runGit(['config', 'user.email', `"${systemEmail}"`], req);
    }
  } catch (err) {
    console.warn('Failed to ensure git user config:', err);
  }
}

export async function getGitStatus(req?: any): Promise<string> {
  return runGit(['status', '--porcelain'], req);
}

export async function gitCommit(message: string, req?: any): Promise<string> {
  await ensureGitUserConfig(req);
  await runGit(['add', '.'], req);
  return runGit(['commit', '-m', `"${message}"`], req);
}

export async function gitPush(req?: any): Promise<string> {
  const branch = await runGit(['branch', '--show-current'], req);
  return runGit(['push', 'origin', branch], req);
}

export async function gitPull(req?: any): Promise<string> {
  const branch = await runGit(['branch', '--show-current'], req);
  return runGit(['pull', 'origin', branch], req);
}

export async function getGitBranch(req?: any): Promise<string> {
  return runGit(['branch', '--show-current'], req);
}

export async function cloneRepo(url: string, targetPath: string): Promise<string> {
  const cmd = `git clone "${url}" "${targetPath}"`;
  try {
    const { stdout, stderr } = await execAsync(cmd);
    return (stdout + '\n' + stderr).trim();
  } catch (err) {
    throw new Error(`Git clone failed: ${cmd}\nError: ${(err as Error).message}`);
  }
}

export async function hasGitRemote(req?: any): Promise<boolean> {
  try {
    const remotes = await runGit(['remote'], req);
    return remotes.trim().length > 0;
  } catch (err) {
    return false;
  }
}

export async function getGitAheadCount(req?: any): Promise<number> {
  try {
    const targetDir = getTargetDir(req);
    await execAsync('git rev-parse --abbrev-ref @{u}', { cwd: targetDir });
    const { stdout } = await execAsync('git rev-list --count @{u}..HEAD', { cwd: targetDir });
    return parseInt(stdout.trim(), 10) || 0;
  } catch (err) {
    return 0;
  }
}

export async function getCommitDiff(req?: any): Promise<string> {
  await runGit(['add', '.'], req);
  return runGit(['diff', '--cached'], req);
}

export async function gitShowHead(filePath: string, req?: any): Promise<string> {
  try {
    return await runGit(['show', `HEAD:${filePath}`], req);
  } catch (err) {
    return '';
  }
}
