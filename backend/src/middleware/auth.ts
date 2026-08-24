import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { verifySessionToken } from '../utils/auth.js';
import { mountUserVfs } from '../utils/vfs.js';

export interface AuthenticatedRequest extends Request {
  user?: string;
  accessToken?: string;
}

export function getGitHubClientId(): string {
  if (process.env.GITHUB_CLIENT_ID) return process.env.GITHUB_CLIENT_ID;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'github_client_id';").get() as { value: string } | undefined;
    return row?.value || '';
  } catch {
    return '';
  }
}

export function getGitHubClientSecret(): string {
  if (process.env.GITHUB_CLIENT_SECRET) return process.env.GITHUB_CLIENT_SECRET;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'github_client_secret';").get() as { value: string } | undefined;
    return row?.value || '';
  } catch {
    return '';
  }
}

export function getAllowedUser(): string {
  if (process.env.ALLOWED_USER) return process.env.ALLOWED_USER;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'allowed_user';").get() as { value: string } | undefined;
    return row?.value || '';
  } catch {
    return '';
  }
}

export function isHostedModeActive(): boolean {
  if (getGitHubClientId()) return true;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'simulate_hosted_mode';").get() as { value: string } | undefined;
    return row?.value === 'true';
  } catch {
    return false;
  }
}

export function isUserAdmin(username: string | null | undefined): boolean {
  if (!username) return false;
  if (!isHostedModeActive()) return true;
  const allowed = getAllowedUser();
  const adminUsers = (process.env.ADMIN_USERS || 'plbogen,plbogen2')
    .split(',')
    .map(u => u.trim().toLowerCase())
    .filter(Boolean);
  if (allowed) {
    adminUsers.push(allowed.toLowerCase());
  }
  return adminUsers.includes(username.toLowerCase());
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!isHostedModeActive()) {
    return next();
  }

  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c: string) => {
      const parts = c.trim().split('=');
      return [parts[0], parts.slice(1).join('=')];
    })
  );

  const sessionToken = cookies['session_token'];
  if (!sessionToken) {
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Session missing' });
  }

  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';
  const sessionData = verifySessionToken(sessionToken, secret);
  if (!sessionData) {
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
  }

  req.user = sessionData.username;
  if (req.user) {
    const vfsSecret = crypto.createHash('sha256').update(`${req.user}:${secret}`).digest('hex');
    mountUserVfs(req.user, vfsSecret).catch((err) => {
      console.warn(`Failed to auto-mount VFS for ${req.user}:`, err);
    });
  }

  let accessToken = sessionData.accessToken;
  if (!accessToken && req.user) {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(`github_access_token:${req.user}`) as { value: string } | undefined;
      if (row && row.value) {
        accessToken = row.value;
      }
    } catch {
      // ignore
    }
  }
  req.accessToken = accessToken;
  next();
}
