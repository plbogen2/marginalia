import path from 'path';
import os from 'os';
import { getUserStorageRoot } from '../config.js';

export function isPathSafe(targetPath: string, baseDir: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(baseDir);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

export function isWorkspacePathAllowed(targetPath: string, username?: string): boolean {
  const resolvedPath = path.resolve(targetPath);
  
  if (username) {
    const userSandbox = getUserStorageRoot(username);
    return resolvedPath.startsWith(userSandbox + path.sep) || resolvedPath === userSandbox;
  }

  const homeDir = os.homedir();
  if (resolvedPath.startsWith(homeDir + path.sep) || resolvedPath === homeDir) {
    return true;
  }
  
  if (process.env.NODE_ENV === 'test' && (resolvedPath.startsWith('/tmp/') || resolvedPath.startsWith('/private/tmp/'))) {
    return true;
  }
  
  if (process.env.ALLOWED_WORKSPACE_ROOT) {
    const allowedRoot = path.resolve(process.env.ALLOWED_WORKSPACE_ROOT);
    if (resolvedPath.startsWith(allowedRoot + path.sep) || resolvedPath === allowedRoot) {
      return true;
    }
  }

  return false;
}
