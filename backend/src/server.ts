import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config/env.js';

/**
 * The listening entrypoint: local development and the end-to-end suite.
 *
 * Deployed, nothing runs this file. Vercel's Hono runtime imports the default
 * export of `app.ts` and calls `app.fetch` per request — no port is ever
 * bound. An earlier revision believed the opposite, that a service is started
 * by a file calling `listen()`, and the deploy refused it: a file that starts
 * a listener is not a file that exports an app.
 *
 * The drift risk that belief was guarding against is still covered. Both
 * entrypoints are one import away from the same `createApp()`, and this one
 * adds nothing but the listener — so the program the suite drives here is the
 * program production serves, minus the port.
 */
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.warn(`crema api  →  http://localhost:${info.port}  [${env.DATA_SOURCE}]`);
});
