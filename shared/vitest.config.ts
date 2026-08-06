import { defineConfig } from 'vitest/config';

/**
 * The contract package is pure functions and schema definitions with no I/O,
 * so the thresholds are set higher than the 80/75 the other workspaces use.
 * There is nothing here that is hard to reach, and anything uncovered is
 * either dead or a validation rule nobody has tested.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: 95,
        branches: 90,
        functions: 95,
        statements: 95,
      },
    },
  },
});
