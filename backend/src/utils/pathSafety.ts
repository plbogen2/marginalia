import path from 'path';
import os from 'os';
import fs from 'fs';
import { getUserStorageRoot } from '../config.js';

function getRealPathSync(filePath: string): string {
  let current = path.resolve(filePath);
  const segments: string[] = [];

  while (true) {
    try {
      const real = fs.realpathSync(current);
      return path.resolve(real, ...segments.reverse());
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        const parent = path.dirname(current);
        if (parent === current) {
          return path.resolve(current, ...segments.reverse());
        }
        segments.push(path.basename(current));
        current = parent;
      } else {
        throw err;
      }
    }
  }
}

export function isPathSafe(targetPath: string, baseDir: string): boolean {
  try {
    const resolvedTarget = getRealPathSync(targetPath);
    const resolvedBase = fs.realpathSync(path.resolve(baseDir));
    return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
  } catch (e) {
    return false;
  }
}

export function isWorkspacePathAllowed(targetPath: string, username?: string): boolean {
  try {
    const resolvedPath = getRealPathSync(targetPath);
    
    if (username) {
      const userSandbox = fs.realpathSync(getUserStorageRoot(username));
      return resolvedPath.startsWith(userSandbox + path.sep) || resolvedPath === userSandbox;
    }

    const homeDir = fs.realpathSync(os.homedir());
    if (resolvedPath.startsWith(homeDir + path.sep) || resolvedPath === homeDir) {
      return true;
    }
    
    if (process.env.NODE_ENV === 'test' && (resolvedPath.startsWith('/tmp/') || resolvedPath.startsWith('/private/tmp/'))) {
      return true;
    }
    
    if (process.env.ALLOWED_WORKSPACE_ROOT) {
      const allowedRoot = fs.realpathSync(path.resolve(process.env.ALLOWED_WORKSPACE_ROOT));
      if (resolvedPath.startsWith(allowedRoot + path.sep) || resolvedPath === allowedRoot) {
        return true;
      }
    }
  } catch (e) {
    return false;
  }

  return false;
}
