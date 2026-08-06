import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Database tests need a live Postgres and run under vitest.db.config.ts.
    exclude: ['src/**/*.db.test.ts'],
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
