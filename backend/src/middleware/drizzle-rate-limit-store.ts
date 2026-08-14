import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { RateLimitStore, RateLimitWindow } from './rate-limit-store.js';

/**
 * The shared store: one row per caller in `rate_limit_windows`, upserted
 * atomically so every serverless instance draws from the same budget.
 *
 * The whole hit is a single statement. Read-then-write would be two round
 * trips and a race — two instances reading the same count and both writing
 * count+1 have together counted one request. `insert … on conflict do update`
 * makes Postgres serialise the increment, which is the entire reason the
 * counts can be trusted enough to spend money behind.
 *
 * A lapsed window is reset in the same statement rather than deleted first:
 * the CASE expressions ask "has this row's window closed" and either bump the
 * count or start a fresh one. `excluded.reset_at` carries the new deadline the
 * insert proposed, so the window length is computed once, in one place.
 */
export class DrizzleRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Database) {}

  async hit(key: string, windowMs: number): Promise<RateLimitWindow> {
    const [row] = await this.db.execute<UpsertedWindow>(sql`
      insert into public.rate_limit_windows as w (key, count, reset_at)
      values (${key}, 1, now() + make_interval(secs => ${windowMs / 1000}))
      on conflict (key) do update
        set count    = case when w.reset_at <= now() then 1 else w.count + 1 end,
            reset_at = case when w.reset_at <= now() then excluded.reset_at else w.reset_at end
      returning count, reset_at
    `);

    if (!row)
      throw new Error('The rate limit upsert returned no row, which should be unreachable.');

    const window = {
      count: Number(row.count),
      resetAt: new Date(row.reset_at).getTime(),
    };

    // A fresh window is the cheap moment to take the rubbish out: it happens
    // once per caller per window rather than once per request, and the delete
    // is fire-and-forget because limiting this request must not wait on
    // housekeeping. Rows an hour past their reset are counters nobody will
    // ever read again.
    if (window.count === 1) {
      this.db
        .execute(
          sql`delete from public.rate_limit_windows where reset_at <= now() - interval '1 hour'`,
        )
        .catch(() => undefined);
    }

    return window;
  }
}

/** The driver hands `count` back as it stored it and `reset_at` per its type parsers. */
interface UpsertedWindow extends Record<string, unknown> {
  count: number | string;
  reset_at: string | Date;
}
