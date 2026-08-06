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

export function rateLimit({ limit, windowMs }: RateLimitOptions): MiddlewareHandler<AppEnv> {
  // Per limiter instance, so two limiters never share a budget and each app
  // built by `createApp()` starts with a clean one.
  const windows = new Map<string, Window>();

  return async (c, next) => {
    const key = callerKey(c);
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
 * `x-forwarded-for` is trusted here because on Vercel the platform sets it and
 * a client cannot override it. Behind a proxy that does not, this header is
 * caller-controlled and the limit becomes advisory — which is the same thing
 * the module comment already says about it.
 */
function callerKey(c: Context<AppEnv>): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';

  return c.req.header('x-real-ip') ?? 'unknown';
}

function sweep(windows: Map<string, Window>, now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}
