import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import { DrizzleRateLimitStore } from './drizzle-rate-limit-store.js';
import { createAiRateLimitStore, InMemoryRateLimitStore } from './rate-limit-store.js';

describe('InMemoryRateLimitStore', () => {
  it('counts hits against a key within one window', async () => {
    const store = new InMemoryRateLimitStore();

    expect((await store.hit('caller', 60_000)).count).toBe(1);
    expect((await store.hit('caller', 60_000)).count).toBe(2);
    expect((await store.hit('caller', 60_000)).count).toBe(3);
  });

  it('counts each key separately', async () => {
    const store = new InMemoryRateLimitStore();

    await store.hit('one', 60_000);
    await store.hit('one', 60_000);

    expect((await store.hit('other', 60_000)).count).toBe(1);
  });

  it('keeps the reset time fixed for the life of a window', async () => {
    const store = new InMemoryRateLimitStore();

    const first = await store.hit('caller', 60_000);
    const second = await store.hit('caller', 60_000);

    // A window that slid with every request would never close for a caller
    // who keeps knocking — which is exactly the caller it exists for.
    expect(second.resetAt).toBe(first.resetAt);
  });

  it('opens a fresh window once the old one lapses', async () => {
    const store = new InMemoryRateLimitStore();

    await store.hit('caller', 1);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect((await store.hit('caller', 1)).count).toBe(1);
  });

  it('hands back a copy, not its own ledger entry', async () => {
    const store = new InMemoryRateLimitStore();

    const window = await store.hit('caller', 60_000);
    window.count = 999;

    expect((await store.hit('caller', 60_000)).count).toBe(2);
  });
});

describe('createAiRateLimitStore', () => {
  it('keeps the counts in memory when there is no database', () => {
    expect(createAiRateLimitStore(loadEnv({}))).toBeInstanceOf(InMemoryRateLimitStore);
  });

  it('keeps them in Postgres when the deployment has one', () => {
    // Building the store opens nothing — postgres.js connects lazily, the same
    // property the repository factory's own test leans on.
    const store = createAiRateLimitStore(
      loadEnv({
        DATA_SOURCE: 'postgres',
        DATABASE_URL: 'postgres://crema:crema@localhost:5432/crema',
      }),
    );

    expect(store).toBeInstanceOf(DrizzleRateLimitStore);
  });
});
