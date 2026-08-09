import { brewStatsSchema, type BrewStats, type CreateBrewInput } from '@crema/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { InMemoryBrewRepository } from '../repositories/in-memory-brew.repository.js';

const input: CreateBrewInput = {
  beans: 'Ethiopian Yirgacheffe',
  method: 'v60',
  coffeeGrams: 18,
  waterGrams: 288,
  rating: 5,
  tastingNotes: 'Blackcurrant, jasmine, tea-like and clean',
};

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp({ brews: new InMemoryBrewRepository() });
});

async function given(overrides: Partial<CreateBrewInput> = {}): Promise<void> {
  const response = await app.request('/api/brews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, ...overrides }),
  });

  expect(response.status, 'setup failed to create a brew').toBe(201);
}

async function stats(): Promise<BrewStats> {
  const response = await app.request('/api/stats');
  expect(response.status).toBe(200);

  return (await response.json()) as BrewStats;
}

describe('GET /api/stats', () => {
  it('responds 200 for an empty log, not 404', async () => {
    const response = await app.request('/api/stats');

    expect(response.status).toBe(200);
  });

  it('answers an empty log with real zeroes the client can render', async () => {
    await expect(stats()).resolves.toEqual({
      brewCount: 0,
      averageRating: null,
      averageRatio: null,
      methodsUsed: 0,
      firstBrewedAt: null,
      lastBrewedAt: null,
      byMethod: [],
    });
  });

  it('returns stats the shared contract accepts', async () => {
    await given();
    const result = await stats();

    expect(() => brewStatsSchema.parse(result)).not.toThrow();
  });

  it('counts brews and methods', async () => {
    await given({ method: 'v60' });
    await given({ method: 'espresso', coffeeGrams: 18, waterGrams: 36 });

    const result = await stats();

    expect(result.brewCount).toBe(2);
    expect(result.methodsUsed).toBe(2);
  });

  it('breaks down by method, most brewed first', async () => {
    await given({ method: 'v60' });
    await given({ method: 'v60' });
    await given({ method: 'espresso', coffeeGrams: 18, waterGrams: 36 });

    const result = await stats();

    expect(result.byMethod.map((row) => row.method)).toEqual(['v60', 'espresso']);
    expect(result.byMethod[0]?.brewCount).toBe(2);
  });

  it('follows a delete, so the panel and the list never disagree', async () => {
    const created = await app.request('/api/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const { id } = (await created.json()) as { id: string };

    await app.request(`/api/brews/${id}`, { method: 'DELETE' });

    expect((await stats()).brewCount).toBe(0);
  });

  it('agrees with the brew list about how many brews there are', async () => {
    await given({ method: 'v60' });
    await given({ method: 'chemex', coffeeGrams: 22, waterGrams: 352 });
    await given({ method: 'drip', coffeeGrams: 10, waterGrams: 120 });

    const listed = (await (await app.request('/api/brews')).json()) as { total: number };

    // The page title is `Brews: {n}`. Two sources for that number would
    // eventually show two different numbers on the same screen.
    expect((await stats()).brewCount).toBe(listed.total);
  });
});
