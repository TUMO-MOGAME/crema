import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // `@crema/shared` is a workspace package that ships TypeScript source, so it
  // has to be bundled in rather than left as a runtime import.
  noExternal: ['@crema/shared'],
});
