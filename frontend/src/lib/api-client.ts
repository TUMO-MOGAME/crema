import { isApiErrorBody, type ErrorCode, type FieldError } from '@crema/shared';
import type { ZodType } from 'zod';

/**
 * Where the API is.
 *
 * Empty means same origin, and that is what the deployment is: one Vercel
 * project serves the SPA at `/` and rewrites `/api` to the backend service, so
 * the browser only ever talks to the host it was loaded from. No CORS
 * exchange, and the tight `connect-src 'self'` in `vercel.json` covers it
 * without naming a domain.
 *
 * Development is the exception rather than the rule here — two processes on
 * two ports genuinely are two origins — so the dev default names the API
 * explicitly. `VITE_API_BASE_URL` overrides both, for a deployment where the
 * API really does live somewhere else.
 *
 * The old default was `http://localhost:3000` in every environment, which is
 * correct on one machine and broken everywhere else: a production bundle built
 * without the variable set would have asked each visitor's own computer for
 * the brew log.
 */
const DEFAULT_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000' : '';

/**
 * Exported for the one caller `apiRequest` cannot serve: the coach's
 * server-sent event stream, which reads a body incrementally where this file's
 * contract is "parse a complete response". Both build their URLs from the same
 * value, so the API cannot live in two places.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(
  /\/+$/,
  '',
);

const BASE_URL = API_BASE_URL;

/**
 * Every failure the client can see, in one type.
 *
 * `NETWORK_ERROR` covers the case the server never answered at all, which is
 * distinct from the server answering with a problem and matters to the UI: one
 * is worth a retry button, the other is not.
 */
export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly status: number;
  readonly details: readonly FieldError[];
  readonly requestId: string | undefined;

  constructor(
    code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    status: number,
    details: readonly FieldError[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }

  /** Retrying a 4xx with the same body will fail the same way. */
  get isRetryable(): boolean {
    return this.code === 'NETWORK_ERROR' || this.status >= 500 || this.status === 429;
  }

  /** Field errors keyed for handing straight to React Hook Form. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((detail) => [detail.field, detail.message]));
  }
}

/**
 * How a caller says what it expects back.
 *
 * Passing a schema is what turns `apiRequest` from a cast into a check. Without
 * one the return type is a promise the compiler believes and nothing verifies —
 * a renamed field or a proxy answering with an HTML error page flows straight
 * into render, and the stack trace lands somewhere far from the cause.
 */
interface RequestOptions extends RequestInit {
  schema?: ZodType;
}

/**
 * How long a request may go unanswered before it is abandoned.
 *
 * Without a ceiling, a connection that neither completes nor errors — a hop
 * that went quiet mid-request — leaves the UI on "Saving…" forever, which is
 * a state with no exit. Fifteen seconds is far past anything this API does in
 * health; what it bounds is the pathological case, and the failure it produces
 * is the retryable network error every screen already knows how to render.
 *
 * The coach's SSE stream does not come through here, deliberately: a streamed
 * answer is *supposed* to stay open while the model thinks, and it carries its
 * own abort signal instead.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { schema, ...init } = options;
  let response: Response;

  // The caller's signal and the deadline, whichever fires first — the same
  // composition the backend uses on its own model calls.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal,
      headers: {
        // Only when there is something to describe. Setting it unconditionally
        // put `Content-Type: application/json` on every GET and DELETE, and
        // that value is not CORS-safelisted — so each one paid for a preflight
        // it had no need of.
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch (error) {
    // Named separately because the reader's next move differs: a refused
    // connection says check the network, a timeout says the server may still
    // be there and slow — trying again is reasonable either way, which is why
    // both wear the retryable code.
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';

    throw new ApiError(
      'NETWORK_ERROR',
      timedOut
        ? 'The server is taking too long to answer. Try again.'
        : 'Could not reach the server. Check your connection and try again.',
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiError(
        payload.error.code,
        payload.error.message,
        response.status,
        payload.error.details ?? [],
        payload.error.requestId,
      );
    }

    throw new ApiError(
      'INTERNAL_ERROR',
      `The server responded with status ${response.status}.`,
      response.status,
    );
  }

  if (schema) {
    const result = schema.safeParse(payload);

    if (!result.success) {
      // A 200 whose body is the wrong shape is a broken server, not a broken
      // request — so it reads as an internal error rather than a validation
      // failure, which in this app means "you typed something wrong". Failing
      // here also means the failure names the response, instead of surfacing
      // three components away as an undefined that cannot be read.
      throw new ApiError(
        'INTERNAL_ERROR',
        'The server sent a response this app does not understand.',
        response.status,
      );
    }

    return result.data as T;
  }

  return payload as T;
}
