import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      // Database tests need a live Postgres and run under vitest.db.config.ts.
      'src/**/*.db.test.ts',
      // AI tests call a hosted model, so they need a key and cost money per
      // run. They run under vitest.ai.config.ts.
      'src/**/*.ai.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // The listener has nothing to assert and the type file emits no runtime code.
        'src/server.ts',
        'src/types.ts',
        // Declarative table definitions with no branching logic. Excluded not
        // because they are untested but because line coverage is the wrong
        // instrument: the Database CI stage applies the migrations to a real
        // Postgres and compares the result against these declarations, which is
        // a far stronger check than a unit test that merely imports the file.
        'src/db/schema.ts',
        // The Postgres adapter and its connection factory, for the same reason.
        // Both are covered — by `drizzle-brew.repository.db.test.ts`, running
        // the shared repository contract against a real database in the
        // Database stage. Counting them here would measure how much of an
        // adapter the *other* adapter's tests happen to touch, which is not a
        // number worth having.
        'src/db/client.ts',
        'src/repositories/drizzle-brew.repository.ts',
        // The Gemini adapter, and the same argument a third time. It is covered
        // by `gemini-ai-provider.ai.test.ts`, which runs the shared provider
        // contract against the real model. Counting it here would report how
        // much of it the *fake's* tests reach, which is none of it — a number
        // that would only ever be misleading.
        'src/ai/gemini-ai-provider.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
