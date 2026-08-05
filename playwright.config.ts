import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against production builds of both sides, not dev
 * servers. A dev server hides exactly the class of failure worth catching here:
 * a bad build config, a broken asset path, or an environment variable that was
 * only ever set locally.
 *
 * Ports deliberately avoid 3000 and 5173 so a running dev session does not
 * collide with a test run.
 */
const WEB = 'http://localhost:4173';
const API = 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,

  // A `.only` left in a spec silently narrows CI to one test. Fail instead.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Serial on CI so the two web servers are never contended; locally Playwright
  // picks a sensible worker count itself. Spread rather than an explicit
  // `undefined`, which exactOptionalPropertyTypes rightly rejects.
  ...(process.env.CI ? { workers: 1 } : {}),

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run build -w @crema/backend && node backend/dist/server.js',
      url: `${API}/api/health`,
      env: { PORT: '3100', CORS_ORIGIN: WEB, NODE_ENV: 'production' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // VITE_API_BASE_URL is compiled in, so it has to be set for the build,
      // not just for the preview server.
      command: 'npm run build -w @crema/frontend && npm run preview -w @crema/frontend',
      url: WEB,
      env: { VITE_API_BASE_URL: API },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
