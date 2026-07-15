import { exec } from 'child_process';
import { promisify } from 'util';
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

export async function getGitStatus(req?: any): Promise<string> {
  return runGit(['status', '--porcelain'], req);
}

export async function gitCommit(message: string, req?: any): Promise<string> {
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
