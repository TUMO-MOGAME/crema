import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Test configuration, layered over the build config so the React plugin and
 * module resolution behave identically in both. Kept out of vite.config.ts on
 * purpose: vitest is a root-level dependency the deployed build never sees,
 * and a config file the build loads must not import it. See vite.config.ts.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/env.d.ts'],
        thresholds: {
          lines: 80,
          branches: 75,
          functions: 80,
          statements: 80,
        },
      },
    },
  }),
);
