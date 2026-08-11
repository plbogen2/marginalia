import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import { getStorageDir } from '../config.js';

const execAsync = util.promisify(exec);

export function getEncryptedStorageDir(username: string): string {
  const baseStorage = getStorageDir();
  const rootDir = path.dirname(baseStorage);
  return path.join(rootDir, 'encrypted_storage', username);
}

export function getUserMountDir(username: string): string {
  return path.join(getStorageDir(), username);
}

export async function isGocryptfsAvailable(): Promise<boolean> {
  try {
    await execAsync('which gocryptfs');
    return true;
  } catch {
    return false;
  }
}

export async function isVfsMounted(username: string): Promise<boolean> {
  const mountDir = getUserMountDir(username);
  try {
    const { stdout } = await execAsync(`mountpoint -q "${mountDir}" && echo "yes" || echo "no"`);
    return stdout.trim() === 'yes';
  } catch {
    return false;
  }
}

export async function mountUserVfs(username: string, secretKey: string): Promise<void> {
  const available = await isGocryptfsAvailable();
  const mountDir = getUserMountDir(username);
  const encDir = getEncryptedStorageDir(username);

  await fs.mkdir(mountDir, { recursive: true });

  if (!available) {
    // If gocryptfs is not installed on the system (e.g. local dev mode), fallback cleanly
    return;
  }

  await fs.mkdir(encDir, { recursive: true });

  const mounted = await isVfsMounted(username);
  if (mounted) {
    return;
  }

  // Initialize gocryptfs config if not existing
  try {
    await fs.access(path.join(encDir, 'gocryptfs.conf'));
  } catch {
    await execAsync(`echo "${secretKey}" | gocryptfs -init "${encDir}"`);
  }

  // Mount encrypted directory to user storage path
  try {
    await execAsync(`echo "${secretKey}" | gocryptfs -extpass cat "${encDir}" "${mountDir}"`);
  } catch (err) {
    console.error(`Failed to mount VFS for user ${username}:`, err);
    throw new Error(`Failed to mount VFS: ${(err as Error).message}`);
  }
}

export async function unmountUserVfs(username: string): Promise<void> {
  const mountDir = getUserMountDir(username);
  const available = await isGocryptfsAvailable();
  
  if (!available) {
    return;
  }

  const mounted = await isVfsMounted(username);
  if (!mounted) {
    return;
  }

  try {
    await execAsync(`fusermount -u "${mountDir}"`);
  } catch (err) {
    try {
      await execAsync(`umount -l "${mountDir}"`);
    } catch (e) {
      console.error(`Failed to unmount VFS for user ${username}:`, e);
    }
  }
}
