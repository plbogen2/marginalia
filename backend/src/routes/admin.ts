import { Router, Response } from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { db } from '../db.js';
import { AuthenticatedRequest, isUserAdmin } from '../middleware/auth.js';
import { getStorageDir, getDirectorySize } from '../config.js';

export const adminRouter = Router();

adminRouter.get('/api/admin/metrics', async (req: AuthenticatedRequest, res: Response) => {
  if (!isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Forbidden: Admin metrics are strictly restricted to administrator logins (e.g. plbogen)' });
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const dayAgoSec = nowSec - 86400;
    const weekAgoSec = nowSec - 7 * 86400;
    const monthAgoSec = nowSec - 30 * 86400;

    // Users
    const totalUsersRow = db.prepare("SELECT COUNT(DISTINCT user) as count FROM workspaces WHERE user IS NOT NULL AND user != 'anonymous';").get() as { count: number } | undefined;
    const totalUsers = totalUsersRow?.count || 0;

    const activeUsers24hRow = db.prepare("SELECT COUNT(DISTINCT user) as count FROM analytics_events WHERE created_at >= ? AND user != 'anonymous';").get(dayAgoSec) as { count: number } | undefined;
    const activeUsers7dRow = db.prepare("SELECT COUNT(DISTINCT user) as count FROM analytics_events WHERE created_at >= ? AND user != 'anonymous';").get(weekAgoSec) as { count: number } | undefined;

    // Storage
    let totalStorageBytes = 0;
    const userStorageBreakdown: { user: string; sizeBytes: number }[] = [];
    const storageRoot = getStorageDir();
    try {
      if (existsSync(storageRoot)) {
        const userDirs = await fs.readdir(storageRoot, { withFileTypes: true });
        for (const u of userDirs) {
          if (u.isDirectory()) {
            const userPath = path.join(storageRoot, u.name);
            const size = await getDirectorySize(userPath);
            totalStorageBytes += size;
            userStorageBreakdown.push({ user: u.name, sizeBytes: size });
          }
        }
      }
    } catch {
      // ignore
    }

    // AI Token Usage
    const tokenTotals = db.prepare(`
      SELECT 
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens
      FROM ai_token_usage;
    `).get() as { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    const tokensByFeature = db.prepare(`
      SELECT feature, SUM(total_tokens) as total_tokens, COUNT(*) as count
      FROM ai_token_usage
      GROUP BY feature
      ORDER BY total_tokens DESC;
    `).all() as any[];

    const tokensByModel = db.prepare(`
      SELECT model, SUM(total_tokens) as total_tokens, COUNT(*) as count
      FROM ai_token_usage
      GROUP BY model
      ORDER BY total_tokens DESC;
    `).all() as any[];

    const tokensTimeSeries = db.prepare(`
      SELECT date(created_at, 'unixepoch') as date, SUM(total_tokens) as total_tokens, COUNT(*) as count
      FROM ai_token_usage
      WHERE created_at >= ?
      GROUP BY date(created_at, 'unixepoch')
      ORDER BY date ASC;
    `).all(monthAgoSec) as any[];

    // Feature Events
    const featureEvents = db.prepare(`
      SELECT feature, COUNT(*) as count
      FROM analytics_events
      GROUP BY feature
      ORDER BY count DESC;
    `).all() as any[];

    const recentEvents = db.prepare(`
      SELECT id, user, event_type, feature, metadata, created_at
      FROM analytics_events
      ORDER BY created_at DESC
      LIMIT 50;
    `).all() as any[];

    res.json({
      overview: {
        totalUsers,
        activeUsers24h: activeUsers24hRow?.count || 0,
        activeUsers7d: activeUsers7dRow?.count || 0,
        totalStorageBytes,
        totalTokens: tokenTotals?.total_tokens || 0,
        promptTokens: tokenTotals?.prompt_tokens || 0,
        completionTokens: tokenTotals?.completion_tokens || 0,
      },
      userStorage: userStorageBreakdown,
      aiUsage: {
        byFeature: tokensByFeature,
        byModel: tokensByModel,
        timeSeries: tokensTimeSeries,
      },
      features: featureEvents,
      recentActivity: recentEvents,
    });
  } catch (err) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
