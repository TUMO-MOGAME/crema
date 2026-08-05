/**
 * The one error shape the API ever returns.
 *
 * The frontend has exactly one thing to parse and one thing to render, which is
 * why the error handling stays small as the surface grows.
 */

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'RATE_LIMITED',
  'AI_UNAVAILABLE',
  'AI_PARSE_FAILED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldError {
  /** Dot path to the offending field, e.g. `coffeeGrams`. */
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Present only for `VALIDATION_FAILED`. */
    details?: FieldError[];
    /** Correlates a client-side failure with a server log line. */
    requestId: string;
  };
}

/** Maps an error code to the status code the API responds with. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  AI_PARSE_FAILED: 422,
  INTERNAL_ERROR: 500,
};

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof error.message === 'string'
  );
}
