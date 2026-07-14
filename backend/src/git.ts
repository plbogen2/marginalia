import { exec } from 'child_process';
import { promisify } from 'util';
import { TARGET_DIR } from './config.js';

const execAsync = promisify(exec);

async function runGit(args: string[]): Promise<string> {
  const cmd = `git ${args.join(' ')}`;
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: TARGET_DIR });
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
