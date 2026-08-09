import { ERROR_STATUS, type ErrorCode, type FieldError } from '@crema/shared';

/**
 * The only error type route handlers are expected to throw.
 *
 * Carrying the code rather than the status number means the mapping to HTTP
 * lives in exactly one place (`ERROR_STATUS` in the shared package), so the
 * frontend and backend can never disagree about what a 404 means.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: FieldError[] | undefined;

  /** Seconds until the caller may retry. Set only on `RATE_LIMITED`. */
  retryAfterSeconds: number | undefined;

  constructor(code: ErrorCode, message: string, details?: FieldError[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  static notFound(resource: string, id?: string): AppError {
    return new AppError(
      'NOT_FOUND',
      id ? `${resource} ${id} was not found.` : `${resource} was not found.`,
    );
  }

  static validation(details: FieldError[]): AppError {
    return new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', details);
  }

  /**
   * Well-formed input that describes something impossible.
   *
   * Separate from `validation` because the client can do something different
   * with it: a 400 points at a field that is wrong on its own, a 422 says the
   * fields are individually fine and wrong together.
   */
  static semantic(message: string, details: FieldError[]): AppError {
    return new AppError('SEMANTIC_INVALID', message, details);
  }

  /**
   * The request body exceeded what the API will read.
   *
   * The limit is named in the message because a caller that hit it needs to
   * know what to aim under, and there is nothing sensitive about the number.
   */
  static payloadTooLarge(maxBytes: number): AppError {
    return new AppError(
      'PAYLOAD_TOO_LARGE',
      `The request body is too large. The limit is ${Math.floor(maxBytes / 1024)} KB.`,
    );
  }

  static rateLimited(retryAfterSeconds: number): AppError {
    const error = new AppError(
      'RATE_LIMITED',
      `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
    );

    // Carried on the error rather than assumed by the handler, so the header
    // and the message can never disagree about how long to wait.
    error.retryAfterSeconds = retryAfterSeconds;
    return error;
  }

  static aiUnavailable(): AppError {
    return new AppError(
      'AI_UNAVAILABLE',
      'The brew coach is not configured on this deployment. Every other feature works normally.',
    );
  }

  /**
   * The model answered, and what it said was not a brew.
   *
   * A 422 rather than a 500, because nothing is broken: the request was valid,
   * the service worked, and the model produced something that does not describe
   * a cup of coffee. The caller's move is to rephrase, which is a different
   * instruction from "try again later" — so it gets a different code.
   *
   * The reason is for the log rather than the reader. Model output can contain
   * whatever was typed into it, so it is never echoed back in the response.
   */
  static aiParseFailed(): AppError {
    return new AppError(
      'AI_PARSE_FAILED',
      'That could not be read as a brew. Try describing the coffee, the method and the amounts.',
    );
  }
}
