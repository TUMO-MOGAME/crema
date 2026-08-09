import { defineConfig } from 'tsup';

/**
 * The contract package has to ship JavaScript.
 *
 * It used to point `main`, `types` and `exports` straight at `src/index.ts`,
 * which every consumer here was happy with — Vite, vitest and tsup all read
 * TypeScript. Node does not. On Vercel the API is compiled file by file rather
 * than bundled, so the deployed function tried to `import` a `.ts` at runtime
 * and died with `Cannot find module .../@crema/shared/src/index.ts` on every
 * request.
 *
 * `types` still points at the source. That keeps a clean clone able to
 * typecheck before anything has been built, which is what `npm run verify` on
 * a fresh checkout depends on, and it means editor navigation lands on the
 * real file rather than a generated declaration.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  // Neutral rather than node: this package is imported by the browser bundle
  // as much as by the API, and nothing in it touches a Node built-in.
  platform: 'neutral',
  target: 'es2023',
  clean: true,
  sourcemap: true,
});
