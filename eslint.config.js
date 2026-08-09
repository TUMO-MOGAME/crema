// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

/**
 * One flat config for the whole monorepo.
 *
 * Type-aware linting is on (`projectService`), which is slower than syntactic
 * linting but is the only way rules like `no-floating-promises` can see enough
 * to be useful. Formatting rules are deliberately absent — Prettier owns
 * formatting, and `eslint-config-prettier` last in the array turns off anything
 * that would fight it.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.vercel/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Config files are plain JS and have no tsconfig to be type-checked against.
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use a `const` object with `as const` instead of an enum.',
        },
      ],
    },
  },

  {
    files: ['frontend/**/*.{ts,tsx}'],
    // `configs.flat` is the flat-config namespace; the top-level `configs`
    // entries are still the legacy eslintrc shape and ESLint 10 rejects them.
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // `*.contract.ts` files export a test suite rather than being one — they are
  // test code by any other measure, so they get the same relaxations.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.contract.ts', '**/test/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  /**
   * Nothing that ships may reach for test code.
   *
   * `backend/src/**` is bundled from `src/server.ts` for the deployment, so an
   * import here is a runtime dependency there. A barrel file re-exporting
   * `ai-provider.contract` put vitest into that graph and failed the deploy
   * with `Could not resolve "vitest"` — while building fine everywhere
   * devDependencies exist, which includes every CI stage. The pipeline could
   * not have caught it, so the rule catches it instead.
   *
   * Test files and the `*.contract.ts` suites they call are exempt below.
   */
  {
    files: ['backend/**/*.ts', 'frontend/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.contract.ts', '**/test/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vitest',
              message:
                'Test-only. Importing it from shipped code puts vitest in the production bundle.',
            },
          ],
          patterns: [
            {
              group: ['**/*.contract', '**/*.contract.ts'],
              message:
                'Contract suites are test code and import vitest. Import them from a *.test.ts file, and never re-export one from a barrel.',
            },
          ],
        },
      ],
    },
  },

  // Build scripts talk to the operator through stdout; that is their interface.
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },

  prettier,
);
