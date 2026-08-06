import type { FieldError } from '@crema/shared';
import type { Context } from 'hono';
import type { output as ZodOutput, ZodError, ZodType } from 'zod';
import { AppError } from './app-error';

/**
 * The bridge between Zod and the API's error envelope.
 *
 * Handlers parse with the shared schemas and never look at a `ZodError`, so the
 * shape of a 400 is decided once here rather than in five route handlers that
 * will eventually disagree.
 */

/** Parses, or throws the 400 the client can render field by field. */
export function parseOrThrow<S extends ZodType>(schema: S, value: unknown): ZodOutput<S> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw AppError.validation(toFieldErrors(result.error));
  }

  return result.data;
}

/**
 * Zod issues as field errors.
 *
 * The path is what the frontend keys React Hook Form's `setError` by, so it has
 * to be the dot path to the input. A whole-body failure — an empty PATCH, for
 * instance — has no path, and is reported against `body` rather than an empty
 * string that would key nothing.
 */
function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'body',
    message: issue.message,
  }));
}

/**
 * The request body, as JSON.
 *
 * Hono throws a `SyntaxError` on a malformed body, which would otherwise reach
 * the error handler as an unexpected error and answer 500 — telling the client
 * the server is broken when in fact their request was.
 */
export async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw AppError.validation([{ field: 'body', message: 'The request body must be valid JSON' }]);
  }
}
