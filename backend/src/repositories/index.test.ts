import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { createBrewRepository } from './index';
import { DrizzleBrewRepository } from './drizzle-brew.repository';
import { InMemoryBrewRepository } from './in-memory-brew.repository';

/**
 * The factory is one `if`, and it is the whole of the deployment story: this is
 * what "switching on Supabase changes no application code" actually rests on.
 *
 * The postgres branch is exercised without a database because `postgres.js`
 * connects lazily — building the adapter opens nothing. That is worth knowing
 * on its own: a serverless function that cannot reach its database still boots,
 * and fails on the request rather than on the import.
 */

describe('createBrewRepository', () => {
  it('builds the in-memory adapter by default', () => {
    const repository = createBrewRepository(loadEnv({}));

    expect(repository).toBeInstanceOf(InMemoryBrewRepository);
  });

  it('seeds it, so a fresh deployment is not an empty screen', async () => {
    const repository = createBrewRepository(loadEnv({}));

    await expect(repository.list()).resolves.not.toHaveLength(0);
  });

  it('builds the Drizzle adapter when the data source says postgres', () => {
    const repository = createBrewRepository(
      loadEnv({
        DATA_SOURCE: 'postgres',
        DATABASE_URL: 'postgres://crema:crema@localhost:5432/crema',
      }),
    );

    expect(repository).toBeInstanceOf(DrizzleBrewRepository);
  });

  it('refuses postgres without a connection string, rather than connecting to undefined', () => {
    // The env loader normally catches this. The guard exists for the path that
    // does not go through it, and this asserts it is a real guard.
    expect(() =>
      createBrewRepository({ ...loadEnv({}), DATA_SOURCE: 'postgres', DATABASE_URL: undefined }),
    ).toThrow(/DATABASE_URL/);
  });
});
