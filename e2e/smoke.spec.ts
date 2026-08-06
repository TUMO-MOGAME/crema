import { expect, test } from '@playwright/test';

const API = 'http://localhost:3100';

test.describe('the brew log', () => {
  test('loads the log from the API', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Brew log' })).toBeVisible();

    // The seeded demo brews, served by the in-memory adapter over real HTTP.
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeVisible();
    await expect(page.getByRole('listitem')).not.toHaveCount(0);
  });

  test('titles the tab with the brew count', async ({ page }) => {
    await page.goto('/');

    // Wait for the list before counting it. `count()` does not retry, so
    // reading it straight after `goto` samples whenever the assertion happens
    // to run — which is sometimes before the rows exist, and then compares a
    // count of zero against a title that has already been set correctly.
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeVisible();

    const rows = await page.getByRole('listitem').count();
    expect(rows).toBeGreaterThan(0);
    await expect(page).toHaveTitle(`Brews: ${rows}`);
  });

  test('filters the list by method', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeVisible();

    await page.getByLabel('Filter by method').selectOption('espresso');

    await expect(page.getByRole('heading', { name: 'Brazilian Santos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeHidden();
  });

  test('adds a brew and shows it in the list', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add' }).click();

    // Scoped to the dialog: the page also carries a method control, and "Method"
    // would otherwise match the filter as well as the field.
    const form = page.getByRole('dialog', { name: 'Add a brew' });

    await form.getByLabel('Beans').fill('Rwandan Nyungwe');
    await form.getByLabel('Method').selectOption('chemex');
    await form.getByLabel('Coffee grams').fill('21');
    await form.getByLabel('Water grams').fill('336');
    await form.getByLabel('Rating (out of 5)').fill('4');
    await form.getByLabel('Tasting notes').fill('Red apple, black tea, clean finish');
    await form.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { name: 'Rwandan Nyungwe' })).toBeVisible();
  });

  test('will not submit a blank field, as the brief requires', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Beans is required')).toBeVisible();
    // Still open, because nothing was saved.
    await expect(page.getByRole('heading', { name: 'Add a brew' })).toBeVisible();
  });

  test('renders without horizontal overflow on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeVisible();

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
