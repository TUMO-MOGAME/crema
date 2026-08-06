/**
 * The one error shape the API ever returns.
 *
 * The frontend has exactly one thing to parse and one thing to render, which is
 * why the error handling stays small as the surface grows.
 */

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'SEMANTIC_INVALID',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'PAYLOAD_TOO_LARGE',
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
    /** Present for the two codes that blame a field: validation and semantic. */
    details?: FieldError[];
    /** Correlates a client-side failure with a server log line. */
    requestId: string;
  };
}

/** Maps an error code to the status code the API responds with. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  /**
   * 422, not 400. The body was well-formed and every field was individually
   * valid — what failed was a rule about the fields *together*, or about the
   * world: 400 grams of coffee and 300 of water is two valid numbers and not a
   * brew. Splitting the two lets the client tell "you typed it wrong" apart
   * from "that is not a thing that can happen".
   */
  SEMANTIC_INVALID: 422,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  /**
   * The body was refused before it was read, so nothing about its contents is
   * known — which is why this is not a validation failure with a field to
   * blame. It is a statement about size alone.
   */
  PAYLOAD_TOO_LARGE: 413,
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
