import { defineConfig } from 'vitest/config';

/**
 * Provider integration tests.
 *
 * Separate from the unit config for the same reason the database tests are:
 * these need something the default run must not depend on. A hosted model costs
 * money per call, needs a key on every machine, takes seconds rather than
 * milliseconds, and can fail for reasons that have nothing to do with the code
 * under test. Keeping them out means `npm test` stays free, fast and offline,
 * while the adapter is still held to the real thing.
 *
 * What they verify is the one question the fake cannot answer: does the model,
 * behind this adapter, actually satisfy the contract the rest of the app was
 * written against.
 *
 *   GEMINI_API_KEY=... npm run test:ai
 *
 * Timeouts are generous because a model call is not a function call, and
 * retries are off — a flaky assertion about a model is information, and hiding
 * it behind a retry is how a provider that fails one time in five gets shipped.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.ai.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    retry: 0,
  },
});
