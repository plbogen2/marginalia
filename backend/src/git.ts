import { exec } from 'child_process';
import { promisify } from 'util';
import { getTargetDir } from './config.js';

const execAsync = promisify(exec);

async function runGit(args: string[]): Promise<string> {
  const cmd = `git ${args.join(' ')}`;
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: getTargetDir() });
    return (stdout + '\n' + stderr).trim();
  } catch (err) {
    throw new Error(`Git command failed: ${cmd}\nError: ${(err as Error).message}`);
  }
}

export async function getGitStatus(): Promise<string> {
  return runGit(['status', '--porcelain']);
}

export async function gitCommit(message: string): Promise<string> {
  await runGit(['add', '.']);
  return runGit(['commit', '-m', `"${message}"`]);
}

export async function gitPush(): Promise<string> {
  // Use current branch
  const branch = await runGit(['branch', '--show-current']);
  return runGit(['push', 'origin', branch]);
}

export async function gitPull(): Promise<string> {
  const branch = await runGit(['branch', '--show-current']);
  return runGit(['pull', 'origin', branch]);
}
export async function getGitBranch(): Promise<string> {
  return runGit(['branch', '--show-current']);
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

export async function hasGitRemote(): Promise<boolean> {
  try {
    const remotes = await runGit(['remote']);
    return remotes.trim().length > 0;
  } catch (err) {
    return false;
  }
}

export async function getGitAheadCount(): Promise<number> {
  try {
    const targetDir = getTargetDir();
    await execAsync('git rev-parse --abbrev-ref @{u}', { cwd: targetDir });
    const { stdout } = await execAsync('git rev-list --count @{u}..HEAD', { cwd: targetDir });
    return parseInt(stdout.trim(), 10) || 0;
  } catch (err) {
    return 0;
  }
}
export async function getCommitDiff(): Promise<string> {
  await runGit(['add', '.']);
  return runGit(['diff', '--cached']);
}
