import type { Context, MiddlewareHandler } from 'hono';
import { AppError } from '../lib/app-error.js';
import type { AppEnv } from '../types.js';
import { InMemoryRateLimitStore, type RateLimitStore } from './rate-limit-store.js';

/**
 * A fixed-window rate limiter. The policy lives here; the counts live in a
 * `RateLimitStore`, and which store decides what the limit is actually worth.
 *
 * With the default in-memory store this is a courtesy limit, not a security
 * control: the API runs as serverless functions, so each instance counts only
 * the requests it happens to serve, and a caller spread across ten cold starts
 * gets ten windows. That is the right price for most of the API, where a
 * request costs a map lookup and the limit exists to stop a runaway client
 * loop with a clean 429 and a `Retry-After`.
 *
 * The AI routes are the exception, and they get the exception: `app.ts` hands
 * their limiter the shared Postgres-backed store, so the budget on the routes
 * that spend money at a third party is one budget across every instance. See
 * `rate-limit-store.ts` for where that decision is made.
 */

export interface RateLimitOptions {
  /** Requests allowed per window, per caller. */
  limit: number;
  windowMs: number;

  /**
   * Whether forwarding headers identify the caller.
   *
   * Passed in rather than read from the environment here, so the decision is
   * visible at the call site and a test can exercise both answers without
   * reaching for the process environment.
   *
   * Defaults to `false`, which is the answer that cannot be exploited by
   * getting it wrong: an unrecognised caller is limited, not exempted.
   */
  trustProxy?: boolean;

  /**
   * Where the counts live. Defaults to a fresh in-memory store per limiter,
   * so two limiters never share a budget and each app built by `createApp()`
   * starts with a clean one.
   */
  store?: RateLimitStore;

  /**
   * Prefixed onto every caller's key. Required the moment two limiters share
   * a store — without it, a request against one would count against both.
   */
  name?: string;
}

export function rateLimit({
  limit,
  windowMs,
  trustProxy = false,
  store = new InMemoryRateLimitStore(),
  name,
}: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const caller = callerKey(c, trustProxy);
    const key = name === undefined ? caller : `${name}:${caller}`;

    // A store failure propagates rather than waving the request through. On
    // the routes that matter — the AI ones — the store is the same database
    // the rest of the request would die on anyway, and a limiter that fails
    // open is not a limiter under exactly the load that finds the failure.
    const window = await store.hit(key, windowMs);

    if (window.count > limit) {
      throw AppError.rateLimited(Math.max(1, Math.ceil((window.resetAt - Date.now()) / 1000)));
    }

    await next();
  };
}

/**
 * Who to count this request against.
 *
 * Forwarding headers are only believed when `TRUST_PROXY` says a proxy in front
 * of this process overwrites them — which is what Vercel does. Believing them
 * unconditionally was the older behaviour and it made the limiter free to
 * bypass: a client sending a fresh `x-forwarded-for` per request gets a fresh
 * window per request, and grows the map on the way through.
 *
 * Untrusted deployments fall back to the socket address, which a client cannot
 * choose. When even that is unavailable the request is counted against a shared
 * bucket rather than waved through: an unattributable caller should be limited
 * together with every other unattributable caller, not exempted from the limit.
 */
function callerKey(c: Context<AppEnv>, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      // The left-most entry is the original client; everything after it was
      // appended by successive hops.
      const client = forwarded.split(',')[0]?.trim();
      if (client) return client;
    }

    const real = c.req.header('x-real-ip')?.trim();
    if (real) return real;
  }

  return socketAddress(c) ?? 'unattributed';
}

/**
 * The peer address, when the runtime exposes one.
 *
 * `getConnInfo` is per-adapter and there is no shared abstraction that works on
 * both Node and the Workers-style runtimes, so this reads what the Node adapter
 * attaches and gives up cleanly anywhere else. Giving up means the shared
 * bucket, which is a limit rather than a hole.
 */
function socketAddress(c: Context<AppEnv>): string | undefined {
  const bindings: unknown = c.env;
  if (typeof bindings !== 'object' || bindings === null) return undefined;

  const incoming = (bindings as { incoming?: { socket?: { remoteAddress?: unknown } } }).incoming;
  const address = incoming?.socket?.remoteAddress;

  return typeof address === 'string' && address.length > 0 ? address : undefined;
}
