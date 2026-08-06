import type { Context, MiddlewareHandler } from 'hono';
import { AppError } from '../lib/app-error';
import type { AppEnv } from '../types';

/**
 * A fixed-window rate limiter, kept in this process's memory.
 *
 * Worth being precise about what this does and does not do. It is a courtesy
 * limit, not a security control: the API runs as serverless functions, so each
 * instance counts only the requests it happens to serve, and a caller spread
 * across ten cold starts gets ten windows. Anything that genuinely must be
 * enforced globally needs shared state — Upstash, or Postgres — and that is a
 * decision to take when there is a reason to, not a dependency to add now.
 *
 * What it does buy is real: a runaway client loop, a misconfigured poller, or a
 * retry storm gets a clean 429 with a `Retry-After` instead of quietly running
 * up a bill. Phase 6 reuses this for the coach routes, where the per-request
 * cost is a model call rather than a map lookup and the limit is much tighter.
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
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Above this many tracked callers, expired windows are swept before adding
 * another. A limiter that never forgets is a memory leak with a schedule.
 */
const SWEEP_THRESHOLD = 10_000;

export function rateLimit({
  limit,
  windowMs,
  trustProxy = false,
}: RateLimitOptions): MiddlewareHandler<AppEnv> {
  // Per limiter instance, so two limiters never share a budget and each app
  // built by `createApp()` starts with a clean one.
  const windows = new Map<string, Window>();

  return async (c, next) => {
    const key = callerKey(c, trustProxy);
    const now = Date.now();
    const current = windows.get(key);

    if (current === undefined || current.resetAt <= now) {
      if (windows.size >= SWEEP_THRESHOLD) sweep(windows, now);
      windows.set(key, { count: 1, resetAt: now + windowMs });
    } else if (current.count >= limit) {
      throw AppError.rateLimited(Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
    } else {
      current.count += 1;
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

function sweep(windows: Map<string, Window>, now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}
