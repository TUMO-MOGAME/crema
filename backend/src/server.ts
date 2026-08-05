import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './config/env';

/**
 * Local development entrypoint only.
 *
 * Production runs on Vercel Functions through `api/index.ts`, which wraps the
 * same `app` instance. Nothing here is part of the deployed bundle.
 */
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.warn(`crema api  →  http://localhost:${info.port}  [${env.DATA_SOURCE}]`);
});
