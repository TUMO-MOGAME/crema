import { brewQuerySchema, createBrewSchema, updateBrewSchema } from '@crema/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/app-error.js';
import { jsonBody, parseOrThrow } from '../lib/validation.js';
import type { BrewService } from '../services/brew.service.js';
import type { AppEnv } from '../types.js';

/**
 * The brew CRUD surface, exactly as PLANNING section 4.4 specifies it.
 *
 * These handlers do HTTP and nothing else: read the request, validate it
 * against the shared schema, hand the result to the service, turn what comes
 * back into a status code. There is no business rule in this file and no
 * knowledge of how anything is stored — the two things that keep a route layer
 * from turning into the place everything ends up.
 *
 * | Method | Path              | Success        | Errors                       |
 * | ------ | ----------------- | -------------- | ---------------------------- |
 * | GET    | /api/brews        | 200 (page)     | 400 bad method/limit/offset  |
 * | GET    | /api/brews/:id    | 200            | 404                          |
 * | POST   | /api/brews        | 201 + Location | 400 shape, 413, 422 semantic |
 * | PATCH  | /api/brews/:id    | 200            | 400 shape, 404, 413, 422     |
 * | DELETE | /api/brews/:id    | 204            | 404                          |
 *
 * `GET /api/brews` answers with a page envelope — `{ brews, total, limit,
 * offset }` — rather than a bare array. It used to return every row, which is
 * a query that works right up until the log is large and then fails without
 * warning. The envelope also carries the count, so a client no longer has to
 * fetch the whole log a second time just to say how big it is.
 */
export function createBrewRoutes(service: BrewService): Hono<AppEnv> {
  return new Hono<AppEnv>()

    .get('/brews', async (c) => {
      // `?method=` with no value is the filter dropdown's "All" option, and
      // means the same as omitting the parameter. An unknown value is a 400 —
      // silently ignoring it would show every brew to someone who asked for one
      // kind and let them believe that was the answer. `limit` and `offset` are
      // read the same way: absent means "the default page", present and
      // malformed means 400 rather than a silently ignored parameter.
      const query = parseOrThrow(brewQuerySchema, present(c, 'method', 'limit', 'offset'));

      return c.json(await service.list(query));
    })

    .get('/brews/:id', async (c) => {
      return c.json(await service.get(brewId(c)));
    })

    .get('/brews/:id/flavor-tags', async (c) => {
      // Tags ride on their own route rather than inside the brew, because most
      // reads of a brew never look at them — the list renders hundreds of rows
      // and wants none of this — while the one screen that does look fetches
      // exactly one brew's worth.
      return c.json(await service.flavorTags(brewId(c)));
    })

    .post('/brews', async (c) => {
      const input = parseOrThrow(createBrewSchema, await jsonBody(c));
      const brew = await service.create(input);

      // 201 with Location, so a client that wants the canonical URL of what it
      // just made does not have to assemble one from the body.
      c.header('Location', `/api/brews/${brew.id}`);
      return c.json(brew, 201);
    })

    .patch('/brews/:id', async (c) => {
      // The id is checked before the body: if it cannot name a brew, no body
      // was ever going to be applied to anything.
      const id = brewId(c);
      const changes = parseOrThrow(updateBrewSchema, await jsonBody(c));

      return c.json(await service.update(id, changes));
    })

    .delete('/brews/:id', async (c) => {
      await service.remove(brewId(c));

      // 204, and deliberately no body. The brew is gone as far as the API is
      // concerned; what the row does behind that is the adapter's business.
      return c.body(null, 204);
    });
}

/**
 * The named query parameters that were actually supplied, with empty values
 * treated as absent.
 *
 * `?method=&limit=` is what an untouched form control sends, and it means "I
 * did not choose", not "I chose the empty string". Handing the schema only the
 * keys that carry a value is what lets every one of them stay `.optional()`
 * without also having to accept `''` as a legal value for each.
 */
function present(c: Context<AppEnv>, ...names: string[]): Record<string, string> {
  const supplied: Record<string, string> = {};

  for (const name of names) {
    const value = c.req.query(name);
    if (value) supplied[name] = value;
  }

  return supplied;
}

const brewIdSchema = z.string().uuid();

/**
 * The `:id` segment, if it could name a brew.
 *
 * A malformed id answers 404 rather than 400, which is the row PLANNING gives
 * these routes. The reasoning: `/api/brews/banana` is a URL that identifies no
 * brew, the same as a well-formed id that was never used. Answering 400 would
 * also tell an unauthenticated caller what a valid id looks like, for nothing
 * in return.
 */
function brewId(c: Context<AppEnv>): string {
  const id = c.req.param('id');

  if (id === undefined || !brewIdSchema.safeParse(id).success) {
    throw AppError.notFound('Brew', id);
  }

  return id;
}
