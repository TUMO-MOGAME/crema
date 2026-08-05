import { handle } from 'hono/vercel';
import { app } from '../src/app';

/**
 * Vercel Functions entrypoint.
 *
 * The Node runtime is chosen explicitly rather than left to default, because
 * the Postgres driver used from Phase 2 onward needs TCP sockets that the edge
 * runtime does not provide.
 */
export const config = { runtime: 'nodejs' };

export default handle(app);
