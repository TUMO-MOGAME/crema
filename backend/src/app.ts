import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createBrewRepository, type BrewRepository } from './repositories';
import { createBrewRoutes } from './routes/brews';
import { healthRoutes } from './routes/health';
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
  app.use('*', secureHeaders());

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

  app.route('/api', healthRoutes);
  app.route('/api', createBrewRoutes(new BrewService(dependencies.brews)));

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}

export const app = createApp();
