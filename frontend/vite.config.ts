import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Build configuration only — test configuration lives in vitest.config.ts.
 *
 * The two used to share this file, which meant importing `defineConfig` from
 * 'vitest/config' and made the production build depend on test tooling. That
 * held locally, where one install carries every workspace and the root, and
 * broke on Vercel, which installs only what the workspace being built
 * declares: vitest lives at the repository root, so `vite build` died loading
 * its own config file. A build has no business importing the test runner, and
 * splitting the files makes that structural rather than intended.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
