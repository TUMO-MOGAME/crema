import { Hono } from 'hono';
import { env, isAiEnabled } from '../config/env';
import type { AppEnv } from '../types';

/**
 * Reports what this deployment can actually do.
 *
 * `ai.enabled` is here so the frontend can decide whether to render the coach
 * surfaces at all, rather than showing them and letting the user discover they
 * are broken. Deployment checks read `dataSource` to confirm which adapter is
 * live without opening a shell.
 */
export const healthRoutes = new Hono<AppEnv>().get('/health', (c) =>
  c.json({
    status: 'ok',
    environment: env.NODE_ENV,
    dataSource: env.DATA_SOURCE,
    ai: {
      enabled: isAiEnabled(),
      model: isAiEnabled() ? env.GEMINI_MODEL : null,
    },
    uptimeSeconds: Math.round(process.uptime()),
  }),
);
