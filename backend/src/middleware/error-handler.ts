import type { ApiErrorBody } from '@crema/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AppError } from '../lib/app-error';
import { env } from '../config/env';

function body(
  code: ApiErrorBody['error']['code'],
  message: string,
  requestId: string,
  details?: ApiErrorBody['error']['details'],
): ApiErrorBody {
  return { error: details ? { code, message, details, requestId } : { code, message, requestId } };
}

/**
 * Turns anything thrown anywhere in the app into the one response shape the
 * frontend knows how to render.
 *
 * Unexpected errors are logged in full and answered with a generic message —
 * a stack trace in an HTTP response is an information leak, not a convenience.
 */
export function errorHandler(error: Error, c: Context): Response {
  const requestId = c.get('requestId') ?? 'unknown';

  if (error instanceof AppError) {
    const response = c.json(
      body(error.code, error.message, requestId, error.details),
      error.status as ContentfulStatusCode,
    );

    if (error.code === 'RATE_LIMITED') {
      response.headers.set('Retry-After', String(error.retryAfterSeconds ?? 60));
    }
    return response;
  }

  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      path: c.req.path,
      method: c.req.method,
      message: error.message,
      stack: env.NODE_ENV === 'production' ? undefined : error.stack,
    }),
  );

  return c.json(
    body(
      'INTERNAL_ERROR',
      'Something went wrong on our end. The error has been logged.',
      requestId,
    ),
    500,
  );
}

export function notFoundHandler(c: Context): Response {
  const requestId = c.get('requestId') ?? 'unknown';
  return c.json(
    body('NOT_FOUND', `No route matches ${c.req.method} ${c.req.path}.`, requestId),
    404,
  );
}
