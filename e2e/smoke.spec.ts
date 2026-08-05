import { expect, test } from '@playwright/test';

const API = 'http://localhost:3100';

test.describe('application shell', () => {
  test('loads and reaches the API', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Crema' })).toBeVisible();
    await expect(page.getByText('ok')).toBeVisible();
    await expect(page.getByText('memory')).toBeVisible();
  });

  test('titles the tab with the brew count', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Brews: 0');
  });

  test('declares the coach unconfigured instead of showing a broken feature', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('not configured on this deployment')).toBeVisible();
  });

  test('renders without horizontal overflow on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});

test.describe('api', () => {
  test('serves health with the deployment facts a check would need', async ({ request }) => {
    const response = await request.get(`${API}/api/health`);
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { status: string; dataSource: string };
    expect(body.status).toBe('ok');
    expect(body.dataSource).toBe('memory');
  });

  test('answers an unknown route with the shared error envelope', async ({ request }) => {
    const response = await request.post(`${API}/api/not-a-route`, { data: {} });
    expect(response.status()).toBe(404);

    const body = (await response.json()) as {
      error: { code: string; requestId: string };
    };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBeTruthy();
  });

  test('sets defensive headers on every response', async ({ request }) => {
    const response = await request.get(`${API}/api/health`);

    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });
});
