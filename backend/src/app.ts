import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './config/env';
import { AppError } from './lib/app-error';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { rateLimit } from './middleware/rate-limit';
import { createBrewRepository, type BrewRepository } from './repositories';
import { brewMethodRoutes } from './routes/brew-methods';
import { createBrewRoutes } from './routes/brews';
import { healthRoutes } from './routes/health';
import { createStatsRoutes } from './routes/stats';
import { BrewService } from './services/brew.service';
import type { AppEnv } from './types';

/**
 * What the app needs from the outside world.
 *
 * Passed in rather than imported by the routes so a test can hand over an empty
 * in-memory repository and get an app whose state it fully controls. The
 * default is the real one, so production wiring stays a single call.
 */
export interface AppDependencies {
  brews: BrewRepository;
}

/**
 * The largest request body the API will read.
 *
 * The biggest brew the schema accepts is 120 characters of beans plus 500 of
 * tasting notes and five short numbers — under 700 bytes as JSON. 16 KB leaves
 * room for whitespace, escaping and a multi-byte alphabet without leaving room
 * for an attack.
 */
export const MAX_BODY_BYTES = 16 * 1024;

/**
 * Builds the application without binding a port.
 *
 * Keeping construction separate from listening is what lets the test suite
 * exercise the real middleware stack — CORS, headers, error handling and all —
 * with `app.request()` and no network involved. `server.ts` and the Vercel
 * entrypoint are thin wrappers over this.
 */
export function createApp(
  dependencies: AppDependencies = { brews: createBrewRepository() },
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requestId());

  app.use(
    '*',
    secureHeaders({
      /**
       * This API serves JSON and nothing else — it has no scripts, styles,
       * images or frames of its own, and nothing should ever embed it. Hono's
       * defaults cover the rest but set no CSP at all, so the one policy that
       * would matter if a response were ever rendered as a document is the one
       * that has to be written out.
       */
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    }),
  );

  app.use(
    '/api/*',
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      exposeHeaders: ['Location', 'Retry-After'],
      maxAge: 86_400,
    }),
  );

  // After CORS, so a preflight is answered by the CORS middleware and never
  // spends any of the caller's budget.
  app.use(
    '/api/*',
    rateLimit({
      limit: env.RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
      // Only where a proxy in front of this process overwrites the forwarding
      // headers. Anywhere else they are caller-supplied, and believing them
      // would let one client hold as many budgets as it cares to invent.
      trustProxy: env.TRUST_PROXY,
    }),
  );

  /**
   * A ceiling on how much body the process will read.
   *
   * Validation runs after the body has been parsed, so the 120-character limit
   * on `beans` bought nothing against a caller who sends two hundred megabytes:
   * the whole thing is in memory before a schema sees it. On an endpoint that
   * requires no authentication, that is a denial of service costing one
   * request.
   *
   * 16 KB is roughly twenty-five times the largest brew the schema will accept,
   * so nothing legitimate comes close.
   */
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw AppError.payloadTooLarge(MAX_BODY_BYTES);
      },
    }),
  );

  const brews = new BrewService(dependencies.brews);

  app.route('/api', healthRoutes);
  app.route('/api', brewMethodRoutes);
  app.route('/api', createBrewRoutes(brews));
  app.route('/api', createStatsRoutes(brews));

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}

export const app = createApp();
