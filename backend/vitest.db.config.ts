import { defineConfig } from 'vitest/config';

/**
 * Database integration tests.
 *
 * Separate from the unit config because these need a live Postgres with the
 * migrations applied. Keeping them out of the default run means `npm test`
 * stays fast and needs no Docker, while CI still exercises the real schema.
 *
 *   docker run -d -p 55432:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine
 *   DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres \
 *     npm run db:apply && npm run test:db
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts'],
    // A single worker: these tests share one database and write to it.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
