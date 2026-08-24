import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { verifySessionToken, createSessionToken } from '../utils/auth.js';
import { mountUserVfs, unmountUserVfs } from '../utils/vfs.js';
import {
  AuthenticatedRequest,
  getGitHubClientId,
  getGitHubClientSecret,
  getAllowedUser,
  isHostedModeActive,
  isUserAdmin,
} from '../middleware/auth.js';

export const authRouter = Router();

authRouter.get('/api/auth/login', (req: AuthenticatedRequest, res: Response) => {
  if (!isHostedModeActive()) {
    return res.redirect('/');
  }

  const clientId = getGitHubClientId();
  if (!clientId) {
    // Simulated mode bypass: immediately redirect to callback
    return res.redirect('/api/auth/github/callback?code=mock_dev_code');
  }

  const host = req.get('host');
  const protocol = req.protocol || 'http';
  const defaultBase = `${protocol}://${host}`;
  const redirectUri = `${process.env.BASE_URL || defaultBase}/api/auth/github/callback`;
  const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,read:user&prompt=consent`;
  res.redirect(authorizeUrl);
});

authRouter.get('/api/auth/github/callback', async (req: AuthenticatedRequest, res: Response) => {
  const { code } = req.query as { code: string };
  if (!code) {
    return res.status(400).send('OAuth callback code missing');
  }

  const clientId = getGitHubClientId();
  const clientSecret = getGitHubClientSecret();
  const allowed = getAllowedUser();
  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';

  try {
    let githubUser = '';
    let accessToken: string | undefined;
    if (!clientId) {
      // Mock bypass
      const simulateRow = db.prepare("SELECT value FROM settings WHERE key = 'simulate_hosted_mode';").get() as { value: string } | undefined;
      if (simulateRow?.value === 'true') {
        githubUser = allowed || 'dev_mock_user';
      } else {
        throw new Error('OAuth Client ID is not configured');
      }
    } else {
      const host = req.get('host');
      const protocol = req.protocol || 'http';
      const defaultBase = `${protocol}://${host}`;
      const redirectUri = `${process.env.BASE_URL || defaultBase}/api/auth/github/callback`;

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      });

      const tokenData = await tokenRes.json() as { access_token?: string, error?: string, error_description?: string };
      if (tokenData.error || !tokenData.access_token) {
        console.error('GitHub OAuth token exchange error:', tokenData);
        throw new Error(tokenData.error_description || tokenData.error || 'Failed to retrieve access token');
      }

      accessToken = tokenData.access_token;

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': 'marginalia-app'
        }
      });
      const userData = await userRes.json() as { login: string };
      githubUser = userData.login;
    }

    if (!githubUser) {
      throw new Error('Failed to retrieve GitHub profile info');
    }

    if (allowed && githubUser.toLowerCase() !== allowed.toLowerCase()) {
      return res.status(403).send(`Access Denied: User ${githubUser} is not whitelisted`);
    }

    if (accessToken) {
      try {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);").run(`github_access_token:${githubUser}`, accessToken);
      } catch (err) {
        console.warn('Failed to save github_access_token to DB:', err);
      }
    }

    const vfsSecret = crypto.createHash('sha256').update(`${githubUser}:${secret}`).digest('hex');
    await mountUserVfs(githubUser, vfsSecret);

    const sessionToken = createSessionToken(githubUser, secret, accessToken);
    const isSecureReq = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
    res.setHeader('Set-Cookie', `session_token=${sessionToken}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}; ${isSecureReq ? 'Secure;' : ''} SameSite=Lax`);

    const frontendUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '/';
    res.redirect(frontendUrl);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    res.status(500).send(`OAuth Authentication failed: ${(err as Error).message}`);
  }
});

authRouter.get('/api/auth/status', (req: AuthenticatedRequest, res: Response) => {
  if (!isHostedModeActive()) {
    return res.json({ loggedIn: true, user: 'local', isOAuthMode: false, isAdmin: true });
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
    return res.json({ loggedIn: false, user: null, isOAuthMode: true, isAdmin: false });
  }

  const secret = process.env.SESSION_SECRET || 'marginalia_default_cookie_session_secret_xyz_123';
  const sessionData = verifySessionToken(sessionToken, secret);
  if (!sessionData) {
    return res.json({ loggedIn: false, user: null, isOAuthMode: true, isAdmin: false });
  }

  const isAdmin = isUserAdmin(sessionData.username);
  res.json({ loggedIn: true, user: sessionData.username, isOAuthMode: true, isAdmin });
});

authRouter.post('/api/auth/logout', async (req: AuthenticatedRequest, res: Response) => {
  if (req.user) {
    await unmountUserVfs(req.user);
  }
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.json({ status: 'ok' });
});
