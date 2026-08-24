import express, { Response, NextFunction } from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

import {
  AuthenticatedRequest,
  authMiddleware,
  isHostedModeActive,
  getAllowedUser,
} from './middleware/auth.js';

import { authRouter } from './routes/auth.js';
import { configRouter } from './routes/config.js';
import { filesRouter } from './routes/files.js';
import { gitRouter } from './routes/git.js';
import { workspacesRouter } from './routes/workspaces.js';
import { aiRouter } from './routes/ai.js';
import { grammarRouter } from './routes/grammar.js';
import { ttsRouter } from './routes/tts.js';
import { adminRouter } from './routes/admin.js';

const app = express();

app.use(express.json());

// Global Auth & Gatekeeper Interceptor
app.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (
    req.path.startsWith('/api/auth/') ||
    req.path === '/api/health' ||
    req.path.startsWith('/samples/')
  ) {
    return next();
  }

  if (req.path === '/api/config') {
    if (req.method === 'GET') {
      return next();
    }
    if (isHostedModeActive() && getAllowedUser()) {
      return authMiddleware(req, res, next);
    }
    return next();
  }

  authMiddleware(req, res, next);
});

// Mount Modular Express Routers
app.use(authRouter);
app.use(configRouter);
app.use(filesRouter);
app.use(gitRouter);
app.use(workspacesRouter);
app.use(aiRouter);
app.use(grammarRouter);
app.use(ttsRouter);
app.use(adminRouter);

// Serve Frontend Static Build
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

export { app };
