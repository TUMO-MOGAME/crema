import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config/env.js';

/**
 * The entrypoint, locally and deployed.
 *
 * It used to say "local development only", with production going through a
 * Vercel Function instead. That is no longer true: the deployment runs both
 * workspaces as services from one origin, and a Node service is started by
 * running a file that calls `listen()` — Vercel watches for that call and
 * routes traffic to the port it binds.
 *
 * Which makes this the same program in both places, and that is worth more
 * than the arrangement it replaced. The thing that runs in production is the
 * thing you run with `npm run dev` and the thing the end-to-end suite drives,
 * rather than a second entrypoint that wrapped the same app and could drift
 * from it without anything noticing.
 *
 * `PORT` is supplied by the platform there and defaults to 3000 here.
 */
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.warn(`crema api  →  http://localhost:${info.port}  [${env.DATA_SOURCE}]`);
});
