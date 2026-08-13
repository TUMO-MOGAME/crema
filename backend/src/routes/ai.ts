import {
  coachRequestSchema,
  extractFlavorTagsRequestSchema,
  quickLogRequestSchema,
} from '@crema/shared';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { AppError } from '../lib/app-error.js';
import { jsonBody, parseOrThrow } from '../lib/validation.js';
import type { CoachService } from '../services/coach.service.js';
import type { FlavorTagService } from '../services/flavor-tag.service.js';
import type { QuickLogService } from '../services/quick-log.service.js';
import type { AppEnv } from '../types.js';

/**
 * The AI surfaces.
 *
 * | Method | Path                | Success       | Errors                            |
 * | ------ | ------------------- | ------------- | --------------------------------- |
 * | POST   | /api/ai/quick-log   | 200           | 400 shape, 413, 422 unreadable,   |
 * |        |                     |               | 429 too many, 503 not configured  |
 * | POST   | /api/ai/coach       | 200, streamed | 400 shape, 413, 429, 503 —        |
 * |        |                     |               | mid-stream failure is an `error`  |
 * |        |                     |               | event, because the 200 is gone    |
 * | POST   | /api/ai/flavor-tags | 200 (tags)    | 400 shape, 404 no such brew,      |
 * |        |                     |               | 429, 503 not configured           |
 *
 * Quick Log answers 200 rather than 201, and the distinction is the whole
 * design position: nothing was created. What comes back is a proposal for a
 * brew, which the user confirms in the normal Add form before anything is
 * written. The route that creates a brew is still `POST /api/brews`, and it is
 * still the only one — the coach's proposals go through the same door.
 *
 * Under `/api/ai` rather than beside the brew routes so the tighter rate limit
 * in `app.ts` can be mounted on a prefix instead of a list of paths that
 * somebody will eventually forget to extend. Here a request costs a model call;
 * everywhere else it costs a map lookup.
 */
export function createAiRoutes(
  quickLog: QuickLogService,
  coach: CoachService,
  flavorTags: FlavorTagService,
): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .post('/ai/flavor-tags', async (c) => {
      // The body names a brew, not notes: the service reads the saved text
      // itself, so what gets tagged is what the log holds. Asked for by the
      // client after a save rather than run during one, so the model's
      // latency lands here, on a request nobody is waiting on.
      const { brewId } = parseOrThrow(extractFlavorTagsRequestSchema, await jsonBody(c));

      return c.json(
        await flavorTags.extract(brewId, {
          requestId: c.get('requestId'),
          signal: c.req.raw.signal,
        }),
      );
    })
    .post('/ai/quick-log', async (c) => {
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
    })
    .post('/ai/coach', async (c) => {
      const { question } = parseOrThrow(coachRequestSchema, await jsonBody(c));

      // Outside the stream on purpose. `ask` throws `AI_UNAVAILABLE`
      // synchronously, and here that is still a clean 503 through the normal
      // error handler — one line down, inside `streamSSE`, the 200 and the
      // headers have already left and no status can be taken back.
      const events = coach.ask(question, {
        requestId: c.get('requestId'),
        signal: c.req.raw.signal,
      });

      return streamSSE(c, async (stream) => {
        try {
          for await (const event of events) {
            await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
          }
        } catch (error) {
          // A failure mid-answer cannot change the status, so it becomes the
          // stream's last word instead of a truncation the reader has to
          // interpret. The generic message is deliberate: model errors can
          // quote their input, and the input is the user's to see, not to have
          // reflected back with a stack trace around it.
          const failure =
            error instanceof AppError
              ? { code: error.code, message: error.message }
              : { code: 'INTERNAL_ERROR', message: 'The coach failed mid-answer. Ask again.' };

          try {
            await stream.writeSSE({
              event: 'error',
              data: JSON.stringify({ type: 'error', ...failure }),
            });
          } catch {
            // The write fails when the client is already gone — which is also
            // the one reader who no longer needs to hear what went wrong.
          }
        }
      });
    });
}
