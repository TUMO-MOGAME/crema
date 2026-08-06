import { BREW_METHODS, type Brew } from '@crema/shared';
import { vi } from 'vitest';

/** `fetch` takes three shapes of first argument; only one is already a string. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;

  return input.url;
}

/** A brew with everything filled in, so a test varies only what it is about. */
export function aBrew(overrides: Partial<Brew> = {}): Brew {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    beans: 'Ethiopian Yirgacheffe',
    method: 'v60',
    coffeeGrams: 18,
    waterGrams: 288,
    rating: 5,
    tastingNotes: 'Blackcurrant, jasmine, tea-like and clean',
    brewedAt: '2026-08-05T06:00:00.000Z',
    createdAt: '2026-08-05T06:00:00.000Z',
    updatedAt: '2026-08-05T06:00:00.000Z',
    ...overrides,
  };
}

interface StubOptions {
  brews?: Brew[];
  /** Status to answer writes with, so error paths can be exercised. */
  writeStatus?: number;
  writeBody?: unknown;
  listStatus?: number;
}

/**
 * A fetch stub that routes by URL and method.
 *
 * Routing rather than a single canned response, because every screen in this
 * app reads at least two endpoints — the list and the method vocabulary — and a
 * stub that answered both with the same body would make the method dropdown
 * silently empty in every test.
 */
export function stubApi({
  brews = [],
  writeStatus = 200,
  writeBody,
  listStatus = 200,
}: StubOptions = {}) {
  const calls: { url: string; method: string; body: unknown }[] = [];

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });

    const json = (payload: unknown, status = 200) =>
      Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify(payload), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    if (url.includes('/api/brew-methods')) return json(BREW_METHODS);

    if (url.includes('/api/brews')) {
      if (method === 'GET') {
        if (listStatus !== 200) {
          return json(
            { error: { code: 'INTERNAL_ERROR', message: 'Server fell over.', requestId: 'r1' } },
            listStatus,
          );
        }

        const filter = /[?&]method=([^&]+)/.exec(url)?.[1];
        const visible = filter ? brews.filter((brew) => brew.method === filter) : brews;
        return json(visible);
      }

      if (method === 'DELETE') return json(null, writeStatus === 200 ? 204 : writeStatus);

      return json(writeBody ?? aBrew(body as Partial<Brew>), writeStatus === 200 ? 201 : writeStatus); // prettier-ignore
    }

    return json({}, 404);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
