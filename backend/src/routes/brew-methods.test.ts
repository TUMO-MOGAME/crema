import { BREW_METHOD_SLUGS, type BrewMethod } from '@crema/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { InMemoryBrewRepository } from '../repositories/in-memory-brew.repository.js';

const app = createApp({ brews: new InMemoryBrewRepository() });

describe('GET /api/brew-methods', () => {
  it('responds 200', async () => {
    const response = await app.request('/api/brew-methods');

    expect(response.status).toBe(200);
  });

  it('serves the whole vocabulary', async () => {
    const methods = (await (await app.request('/api/brew-methods')).json()) as BrewMethod[];

    expect(methods.map((method) => method.slug)).toEqual([...BREW_METHOD_SLUGS]);
  });

  it('carries a label for each, so the client renders no slugs', async () => {
    const methods = (await (await app.request('/api/brew-methods')).json()) as BrewMethod[];

    for (const method of methods) {
      expect(method.label).toBeTruthy();
      expect(method.label).not.toBe(method.slug);
    }
  });

  it('is in display order, which is the order the dropdown wants', async () => {
    const methods = (await (await app.request('/api/brew-methods')).json()) as BrewMethod[];

    // v60 first and cold brew last is the order in 0002_brew_methods.sql.
    expect(methods[0]?.slug).toBe('v60');
    expect(methods.at(-1)?.slug).toBe('cold-brew');
  });

  it('accepts exactly the methods POST /api/brews accepts', async () => {
    const methods = (await (await app.request('/api/brew-methods')).json()) as BrewMethod[];

    // The endpoint exists so the client stops keeping its own copy. If it could
    // offer a method the create route rejects, it would be worse than no
    // endpoint at all.
    for (const method of methods) {
      const response = await app.request('/api/brews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beans: 'Contract check',
          method: method.slug,
          coffeeGrams: 18,
          waterGrams: 288,
          rating: 4,
          tastingNotes: 'Checking the vocabulary agrees with the validator',
        }),
      });

      expect(response.status, `${method.slug} was offered but refused`).toBe(201);
    }
  });
});
