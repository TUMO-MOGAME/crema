import { sharedDatabase } from '../db/client.js';
import { env, type Env } from '../config/env.js';
import { DrizzleRateLimitStore } from './drizzle-rate-limit-store.js';

/**
 * Where a rate limiter keeps its counts.
 *
 * The middleware in `rate-limit.ts` owns the policy — who a request counts
 * against, and what happens when the count is too high. The store owns only
 * the counting, and the split exists because the two have different lifetimes:
 * the policy is the same everywhere, while the counts must live wherever the
 * deployment can actually share them. In-memory is correct for a process that
 * serves every request; Postgres is correct for serverless, where "the
 * process" is many processes that have never met.
 */

export interface RateLimitWindow {
  /** Requests counted against this key in the current window, this one included. */
  count: number;
  /** When the window closes and the count resets, epoch milliseconds. */
  resetAt: number;
}

export interface RateLimitStore {
  /**
   * Count one request against `key`, opening a fresh window if the previous
   * one has lapsed. Always counts — the caller decides whether the count is
   * over the limit, so the store never needs to know what the limit is.
   */
  hit(key: string, windowMs: number): Promise<RateLimitWindow>;
}

/**
 * Above this many tracked callers, expired windows are swept before adding
 * another. A limiter that never forgets is a memory leak with a schedule.
 */
const SWEEP_THRESHOLD = 10_000;

/**
 * The per-process store: a map, and the reason the limiter is honest about
 * being a courtesy on serverless. Each instance counts only what it serves.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, windowMs: number): Promise<RateLimitWindow> {
    const now = Date.now();
    const current = this.windows.get(key);

    if (current === undefined || current.resetAt <= now) {
      if (this.windows.size >= SWEEP_THRESHOLD) this.sweep(now);

      const opened = { count: 1, resetAt: now + windowMs };
      this.windows.set(key, opened);
      return Promise.resolve({ ...opened });
    }

    current.count += 1;
    return Promise.resolve({ count: current.count, resetAt: current.resetAt });
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

/**
 * The one place that decides where the AI limiter's counts live.
 *
 * The same shape as `createBrewRepository` and `createAiProvider`, for the
 * same reason: the decision reads the deployment, and everything above it sees
 * only the interface. With Postgres configured the counts go where every
 * serverless instance can see them, and the budget on the routes that spend
 * money is one budget. Without it — local development, tests — the in-memory
 * store is the same behaviour it has always been.
 *
 * The general API limiter deliberately does not use this. A map lookup per
 * request is a courtesy limit at the right price; a database round trip per
 * request would be paying the AI routes' insurance premium on every endpoint.
 */
export function createAiRateLimitStore(config: Env = env): RateLimitStore {
  if (config.DATA_SOURCE === 'postgres' && config.DATABASE_URL) {
    return new DrizzleRateLimitStore(sharedDatabase(config.DATABASE_URL));
  }

  return new InMemoryRateLimitStore();
}
