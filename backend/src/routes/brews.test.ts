import {
  brewSchema,
  isApiErrorBody,
  type ApiErrorBody,
  type Brew,
  type CreateBrewInput,
} from '@crema/shared';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { InMemoryBrewRepository } from '../repositories/in-memory-brew.repository';

/**
 * Every row of the API table in PLANNING section 4.4, over the real app.
 *
 * `app.request()` runs the whole stack — request id, security headers, CORS,
 * routing, validation, the service, the repository and the error handler — so
 * what these tests assert is what a client over the wire would receive. A test
 * that called the handler function directly would prove less and break more
 * often.
 *
 * The app is rebuilt with an empty repository before each test. Seeded demo
 * data is right for a running app and wrong for a suite: a test that asserts
 * "one brew" is not allowed to depend on twelve others existing.
 */

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

async function post(body: unknown): Promise<Response> {
  return await app.request('/api/brews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function patch(id: string, body: unknown): Promise<Response> {
  return await app.request(`/api/brews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Creates a brew through the API and returns it, for tests that need one. */
async function given(overrides: Partial<CreateBrewInput> = {}): Promise<Brew> {
  const response = await post({ ...input, ...overrides });
  expect(response.status, 'setup failed to create a brew').toBe(201);

  return (await response.json()) as Brew;
}

/** The error, having first asserted the response used the shared envelope. */
async function errorBody(response: Response): Promise<ApiErrorBody['error']> {
  const body: unknown = await response.json();

  expect(isApiErrorBody(body), 'response was not in the shared error envelope').toBe(true);
  return (body as ApiErrorBody).error;
}

describe('GET /api/brews', () => {
  it('responds 200 with an empty list before anything is logged', async () => {
    const response = await app.request('/api/brews');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it('responds 200 with every brew', async () => {
    await given();
    await given({ beans: 'Kenyan AA' });

    const response = await app.request('/api/brews');
    const brews = (await response.json()) as Brew[];

    expect(response.status).toBe(200);
    expect(brews).toHaveLength(2);
  });

  it('returns brews the shared contract accepts, so the frontend types are true', async () => {
    await given();

    const brews = (await (await app.request('/api/brews')).json()) as unknown[];

    expect(() => brewSchema.array().parse(brews)).not.toThrow();
  });

  it('returns the most recently brewed first', async () => {
    const older = await given({ beans: 'Older', brewedAt: daysAgo(5) });
    const newer = await given({ beans: 'Newer', brewedAt: daysAgo(1) });

    const brews = (await (await app.request('/api/brews')).json()) as Brew[];

    expect(brews.map((brew) => brew.id)).toEqual([newer.id, older.id]);
  });
});

describe('GET /api/brews?method=', () => {
  it('responds 200 with only that method', async () => {
    await given({ method: 'v60' });
    await given({ method: 'espresso', coffeeGrams: 18, waterGrams: 36 });

    const response = await app.request('/api/brews?method=espresso');
    const brews = (await response.json()) as Brew[];

    expect(response.status).toBe(200);
    expect(brews).toHaveLength(1);
    expect(brews[0]?.method).toBe('espresso');
  });

  it('responds 400 for a method that is not in the vocabulary', async () => {
    const response = await app.request('/api/brews?method=cafetiere');

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe('VALIDATION_FAILED');
  });

  it('blames the query parameter, not the body', async () => {
    const response = await app.request('/api/brews?method=cafetiere');

    expect((await errorBody(response)).details?.[0]?.field).toBe('method');
  });

  it('treats an empty filter as no filter, which is what the "All" option sends', async () => {
    await given();

    const response = await app.request('/api/brews?method=');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toHaveLength(1);
  });
});

describe('GET /api/brews/:id', () => {
  it('responds 200 with the brew', async () => {
    const created = await given();

    const response = await app.request(`/api/brews/${created.id}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(created);
  });

  it('responds 404 when nothing has that id', async () => {
    const response = await app.request(`/api/brews/${randomUUID()}`);

    expect(response.status).toBe(404);
    expect((await errorBody(response)).code).toBe('NOT_FOUND');
  });

  it('responds 404 for an id that is not a uuid, rather than 500', async () => {
    const response = await app.request('/api/brews/banana');

    expect(response.status).toBe(404);
  });

  it('responds 404 for a deleted brew', async () => {
    const created = await given();
    await app.request(`/api/brews/${created.id}`, { method: 'DELETE' });

    const response = await app.request(`/api/brews/${created.id}`);

    expect(response.status).toBe(404);
  });
});

describe('POST /api/brews', () => {
  it('responds 201 with the created brew', async () => {
    const response = await post(input);
    const brew = (await response.json()) as Brew;

    expect(response.status).toBe(201);
    expect(brew).toMatchObject(input);
    expect(brew.id).toBeTruthy();
  });

  it('sends a Location header pointing at the new brew', async () => {
    const response = await post(input);
    const brew = (await response.clone().json()) as Brew;

    expect(response.headers.get('Location')).toBe(`/api/brews/${brew.id}`);
  });

  it('creates a brew that can then be read back', async () => {
    const created = await given();

    const response = await app.request(`/api/brews/${created.id}`);

    expect(response.status).toBe(200);
  });

  it('responds 400 when a required field is missing', async () => {
    const { beans: _beans, ...withoutBeans } = input;

    const response = await post(withoutBeans);

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe('VALIDATION_FAILED');
  });

  it('responds 400 for a blank field, which the brief requires', async () => {
    const response = await post({ ...input, beans: '   ' });

    expect(response.status).toBe(400);
  });

  it('names the field that failed, so the form can mark it', async () => {
    const response = await post({ ...input, beans: '', rating: 9 });
    const fields = (await errorBody(response)).details?.map((detail) => detail.field);

    expect(fields).toContain('beans');
    expect(fields).toContain('rating');
  });

  it('responds 400 for an unknown brew method', async () => {
    const response = await post({ ...input, method: 'cafetiere' });

    expect(response.status).toBe(400);
  });

  it('responds 400 for a field the contract does not have', async () => {
    const response = await post({ ...input, brewRatio: 16 });

    // `createBrewSchema` is strict. A field the API silently ignored would be a
    // client bug that looks like a server bug.
    expect(response.status).toBe(400);
  });

  it('responds 400 for a server-owned field the client tried to set', async () => {
    const response = await post({ ...input, id: randomUUID() });

    expect(response.status).toBe(400);
  });

  it('responds 400 for a body that is not JSON at all, rather than 500', async () => {
    const response = await app.request('/api/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe('VALIDATION_FAILED');
  });

  it('responds 422 for a brew dated in the future', async () => {
    const response = await post({ ...input, brewedAt: new Date(Date.now() + 86_400_000).toISOString() }); // prettier-ignore

    expect(response.status).toBe(422);
    expect((await errorBody(response)).code).toBe('SEMANTIC_INVALID');
  });

  it('responds 422 for less water than coffee', async () => {
    const response = await post({ ...input, coffeeGrams: 288, waterGrams: 18 });

    expect(response.status).toBe(422);
    expect((await errorBody(response)).code).toBe('SEMANTIC_INVALID');
  });

  it('separates a 422 from a 400: both are the client, only one is a field', async () => {
    const wrongShape = await post({ ...input, rating: 11 });
    const impossible = await post({ ...input, coffeeGrams: 288, waterGrams: 18 });

    expect(wrongShape.status).toBe(400);
    expect(impossible.status).toBe(422);
  });

  it('stores nothing when it refuses', async () => {
    await post({ ...input, beans: '' });
    await post({ ...input, coffeeGrams: 288, waterGrams: 18 });

    await expect((await app.request('/api/brews')).json()).resolves.toEqual([]);
  });
});

describe('PATCH /api/brews/:id', () => {
  it('responds 200 with the updated brew', async () => {
    const created = await given();

    const response = await patch(created.id, { rating: 2 });
    const updated = (await response.json()) as Brew;

    expect(response.status).toBe(200);
    expect(updated.rating).toBe(2);
  });

  it('changes only what it was given', async () => {
    const created = await given();

    const updated = (await (await patch(created.id, { rating: 2 })).json()) as Brew;

    expect(updated.beans).toBe(created.beans);
    expect(updated.tastingNotes).toBe(created.tastingNotes);
  });

  it('persists the change', async () => {
    const created = await given();
    await patch(created.id, { beans: 'Kenyan AA' });

    const reread = (await (await app.request(`/api/brews/${created.id}`)).json()) as Brew;

    expect(reread.beans).toBe('Kenyan AA');
  });

  it('responds 400 for an empty patch, which asks for nothing', async () => {
    const created = await given();

    const response = await patch(created.id, {});

    expect(response.status).toBe(400);
  });

  it('responds 400 for a blank field', async () => {
    const created = await given();

    const response = await patch(created.id, { tastingNotes: '  ' });

    expect(response.status).toBe(400);
  });

  it('responds 400 for a value outside the allowed range', async () => {
    const created = await given();

    const response = await patch(created.id, { rating: 0 });

    expect(response.status).toBe(400);
  });

  it('responds 404 when nothing has that id', async () => {
    const response = await patch(randomUUID(), { rating: 2 });

    expect(response.status).toBe(404);
  });

  it('responds 404 for an id that is not a uuid', async () => {
    const response = await patch('banana', { rating: 2 });

    expect(response.status).toBe(404);
  });

  it('responds 404 for a deleted brew', async () => {
    const created = await given();
    await app.request(`/api/brews/${created.id}`, { method: 'DELETE' });

    const response = await patch(created.id, { rating: 2 });

    expect(response.status).toBe(404);
  });

  it('responds 422 when the patch would make the brew impossible', async () => {
    const created = await given();

    // Individually valid, and 400g of coffee against the stored 288g of water
    // is not a brew. PLANNING lists 400 and 404 for this route; this is the
    // third case, and leaving it out would let PATCH reach a state POST refuses.
    const response = await patch(created.id, { coffeeGrams: 400 });

    expect(response.status).toBe(422);
    expect((await errorBody(response)).code).toBe('SEMANTIC_INVALID');
  });

  it('leaves the brew untouched when it refuses', async () => {
    const created = await given();
    await patch(created.id, { coffeeGrams: 400 });

    const reread = (await (await app.request(`/api/brews/${created.id}`)).json()) as Brew;

    expect(reread).toEqual(created);
  });
});

describe('DELETE /api/brews/:id', () => {
  it('responds 204 with no body', async () => {
    const created = await given();

    const response = await app.request(`/api/brews/${created.id}`, { method: 'DELETE' });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe('');
  });

  it('removes the brew from the list', async () => {
    const created = await given();
    await app.request(`/api/brews/${created.id}`, { method: 'DELETE' });

    await expect((await app.request('/api/brews')).json()).resolves.toEqual([]);
  });

  it('responds 404 when nothing has that id', async () => {
    const response = await app.request(`/api/brews/${randomUUID()}`, { method: 'DELETE' });

    expect(response.status).toBe(404);
  });

  it('responds 404 for an id that is not a uuid', async () => {
    const response = await app.request('/api/brews/banana', { method: 'DELETE' });

    expect(response.status).toBe(404);
  });

  it('responds 404 the second time, so a repeated delete cannot look successful', async () => {
    const created = await given();

    const first = await app.request(`/api/brews/${created.id}`, { method: 'DELETE' });
    const second = await app.request(`/api/brews/${created.id}`, { method: 'DELETE' });

    expect(first.status).toBe(204);
    expect(second.status).toBe(404);
  });

  it('deletes only the brew it was asked about', async () => {
    const kept = await given({ beans: 'Kept' });
    const removed = await given({ beans: 'Removed' });

    await app.request(`/api/brews/${removed.id}`, { method: 'DELETE' });
    const brews = (await (await app.request('/api/brews')).json()) as Brew[];

    expect(brews.map((brew) => brew.id)).toEqual([kept.id]);
  });
});

describe('every failure, in one envelope', () => {
  it('carries a request id on all of them, so a client report is traceable', async () => {
    const responses = await Promise.all([
      app.request('/api/brews?method=cafetiere'),
      app.request(`/api/brews/${randomUUID()}`),
      post({ ...input, beans: '' }),
      post({ ...input, coffeeGrams: 288, waterGrams: 18 }),
    ]);

    for (const response of responses) {
      const error = await errorBody(response);
      expect(error.requestId).toBeTruthy();
      expect(error.requestId).not.toBe('unknown');
    }
  });

  it('never leaks a stack trace', async () => {
    const response = await post({ ...input, beans: '' });
    const body = await response.text();

    expect(body).not.toContain('at ');
    expect(body).not.toContain('.ts:');
  });
});

/** Days before now, as the ISO string the API accepts. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
