import { quickLogRequestSchema } from '@crema/shared';
import { Hono } from 'hono';
import { jsonBody, parseOrThrow } from '../lib/validation';
import type { QuickLogService } from '../services/quick-log.service';
import type { AppEnv } from '../types';

/**
 * The AI surfaces.
 *
 * | Method | Path                | Success | Errors                            |
 * | ------ | ------------------- | ------- | --------------------------------- |
 * | POST   | /api/ai/quick-log   | 200     | 400 shape, 413, 422 unreadable,   |
 * |        |                     |         | 429 too many, 503 not configured  |
 *
 * A 200 rather than a 201, and the distinction is the whole design position:
 * nothing was created. What comes back is a proposal for a brew, which the user
 * confirms in the normal Add form before anything is written. The route that
 * creates a brew is still `POST /api/brews`, and it is still the only one.
 *
 * Under `/api/ai` rather than beside the brew routes so the tighter rate limit
 * in `app.ts` can be mounted on a prefix instead of a list of paths that
 * somebody will eventually forget to extend. Here a request costs a model call;
 * everywhere else it costs a map lookup.
 */
export function createAiRoutes(quickLog: QuickLogService): Hono<AppEnv> {
  return new Hono<AppEnv>().post('/ai/quick-log', async (c) => {
    // The 500-character cap lives in the shared schema, so the browser stops a
    // long paste before it is sent and the API refuses it if it arrives anyway.
    // The body limit in `app.ts` is the cruder guard underneath both.
    const { text } = parseOrThrow(quickLogRequestSchema, await jsonBody(c));

    const proposal = await quickLog.propose(text, {
      requestId: c.get('requestId'),
      // Hono exposes the client's disconnect. Handing it to the provider means
      // a user who navigates away stops paying for tokens they will not see.
      signal: c.req.raw.signal,
    });

    return c.json(proposal);
  });
}
