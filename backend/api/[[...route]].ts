import { handle } from 'hono/vercel';
import { app } from '../src/app.js';

/**
 * Vercel Functions entrypoint.
 *
 * The filename is the routing rule. A file at `api/index.ts` answers `/api`
 * and only `/api` — Vercel maps one file to one path, and every other route
 * this app serves returned a 404 that never reached the function at all.
 * `[[...route]]` is the optional catch-all: it takes `/api` and everything
 * beneath it, so `/api/health`, `/api/brews/:id` and `/api/ai/quick-log` all
 * arrive here with their paths intact and Hono does the routing it already
 * knows how to do.
 *
 * Nothing about the app changes with it. `src/app.ts` is the same object the
 * local server and the test suite use, and this file stays what it has always
 * been: an adapter between one hosting platform's calling convention and an
 * application that does not know it is deployed.
 *
 * The Node runtime is chosen explicitly rather than left to default, because
 * the Postgres driver needs TCP sockets that the edge runtime does not have.
 */
export const config = { runtime: 'nodejs' };

export default handle(app);
