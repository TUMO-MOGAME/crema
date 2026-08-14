import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/client.js';
import { DrizzleRateLimitStore } from './drizzle-rate-limit-store.js';

/**
 * The shared store, against a real Postgres with the migrations applied.
 *
 * The behaviour under test is the atomic upsert — the one thing the in-memory
 * store cannot stand in for, because the whole reason this store exists is
 * what happens when more than one process counts at once.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for database tests. See vitest.db.config.ts.');
}

const { db, close } = createDatabase(connectionString);
const store = new DrizzleRateLimitStore(db);

beforeEach(async () => {
  await db.execute(sql`delete from public.rate_limit_windows`);
});

afterAll(async () => {
  await db.execute(sql`delete from public.rate_limit_windows`);
  await close();
});

describe('DrizzleRateLimitStore', () => {
  it('counts hits against a key within one window', async () => {
    expect((await store.hit('ai:203.0.113.1', 60_000)).count).toBe(1);
    expect((await store.hit('ai:203.0.113.1', 60_000)).count).toBe(2);
    expect((await store.hit('ai:203.0.113.1', 60_000)).count).toBe(3);
  });

  it('counts each key separately', async () => {
    await store.hit('ai:203.0.113.2', 60_000);
    await store.hit('ai:203.0.113.2', 60_000);

    expect((await store.hit('ai:203.0.113.3', 60_000)).count).toBe(1);
  });

  it('keeps the reset time fixed for the life of a window', async () => {
    const first = await store.hit('ai:203.0.113.4', 60_000);
    const second = await store.hit('ai:203.0.113.4', 60_000);

    expect(second.resetAt).toBe(first.resetAt);
  });

  it('opens a fresh window once the old one lapses', async () => {
    // Backdated directly rather than waited for: the behaviour is "a lapsed
    // window resets", not "time passes", and a sleep would test the clock.
    await store.hit('ai:203.0.113.5', 60_000);
    await db.execute(
      sql`update public.rate_limit_windows set reset_at = now() - interval '1 second'
          where key = 'ai:203.0.113.5'`,
    );

    const window = await store.hit('ai:203.0.113.5', 60_000);

    expect(window.count).toBe(1);
    expect(window.resetAt).toBeGreaterThan(Date.now());
  });

  it('counts concurrent hits exactly once each', async () => {
    // The reason the store is a single upsert. Ten concurrent requests through
    // a read-then-write would collapse into fewer counts; ten through the
    // upsert must land as ten.
    const hits = await Promise.all(
      Array.from({ length: 10 }, () => store.hit('ai:203.0.113.6', 60_000)),
    );

    const counts = hits.map((window) => window.count).sort((a, b) => a - b);

    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('sweeps rows an hour past their reset when a fresh window opens', async () => {
    await db.execute(
      sql`insert into public.rate_limit_windows (key, count, reset_at)
          values ('ai:stale', 4, now() - interval '2 hours')`,
    );

    await store.hit('ai:203.0.113.7', 60_000);

    // The delete is fire-and-forget, so give it a moment to land.
    await expect
      .poll(async () => {
        const rows = await db.execute<{ key: string }>(
          sql`select key from public.rate_limit_windows where key = 'ai:stale'`,
        );
        return rows.length;
      })
      .toBe(0);
  });
});
