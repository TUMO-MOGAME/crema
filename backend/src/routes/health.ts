import { Hono } from 'hono';
import { env } from '../config/env.js';
import type { QuickLogService } from '../services/quick-log.service.js';
import type { AppEnv } from '../types.js';

/**
 * Reports what this deployment can actually do.
 *
 * `ai.enabled` is here so the frontend can decide whether to render the AI
 * surfaces at all, rather than showing them and letting the user discover they
 * are broken. Deployment checks read `dataSource` to confirm which adapter is
 * live without opening a shell.
 *
 * It reads that flag from the service the requests go to, rather than asking
 * the environment whether a key is set. Those are not the same question, and
 * answering the easier one is how a health endpoint starts lying: an app built
 * with no provider on a machine that happens to have a key configured would
 * report the AI as available and then answer 503 on every call. Whatever is
 * wired is what gets reported.
 */
export function createHealthRoutes(quickLog: QuickLogService): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/health', (c) =>
    c.json({
      status: 'ok',
      environment: env.NODE_ENV,
      dataSource: env.DATA_SOURCE,
      ai: {
        enabled: quickLog.available,
        model: quickLog.available ? env.GEMINI_MODEL : null,
      },
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );
}
