import { BREW_METHODS, BREW_PAGE, type Brew } from '@crema/shared';
import { vi } from 'vitest';

/** `fetch` takes three shapes of first argument; only one is already a string. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;

  return input.url;
}

/**
 * A distinct, well-formed id from a small number.
 *
 * Fixtures used to carry ids like `'b2'`, which read clearly and are not UUIDs.
 * That was harmless while the client cast its responses; now that it parses
 * them against `brewSchema`, a fixture the real API could never have produced
 * fails validation — correctly. This keeps the ids readable at a glance and
 * valid at the same time.
 */
export function anId(seed: number): string {
  const tail = String(seed).padStart(12, '0');
  return `11111111-1111-4111-8111-${tail}`;
}

/** A brew with everything filled in, so a test varies only what it is about. */
export function aBrew(overrides: Partial<Brew> = {}): Brew {
  return {
    id: anId(1),
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

  /**
   * Holds every write open until `releaseWrites()` is called.
   *
   * Optimistic updates are only observable in the window between the request
   * leaving and the response landing. Without a way to hold that window open, a
   * test asserting "the row appears before the server answers" is really
   * asserting "the row appears", which a non-optimistic implementation also
   * satisfies — it would pass against the code this replaced.
   */
  holdWrites?: boolean;
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
  holdWrites = false,
}: StubOptions = {}) {
  const calls: { url: string; method: string; body: unknown }[] = [];

  // Resolved by `releaseWrites()`. Every held write awaits this same promise,
  // so one call lets all of them through.
  // Replaced by the promise executor below, which runs synchronously.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

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

        // Pages the same way the API does, so a test that asks for page two
        // gets page two rather than the whole log with a different envelope
        // around it. `total` counts what matched the filter, not what fits in
        // the page — the distinction the real endpoint exists to make.
        const query = new URLSearchParams(url.split('?')[1] ?? '');
        const filter = query.get('method');
        const limit = Number(query.get('limit') ?? BREW_PAGE.defaultLimit);
        const offset = Number(query.get('offset') ?? 0);

        const matching = filter ? brews.filter((brew) => brew.method === filter) : brews;

        return json({
          brews: matching.slice(offset, offset + limit),
          total: matching.length,
          limit,
          offset,
        });
      }

      const answer =
        method === 'DELETE'
          ? json(null, writeStatus === 200 ? 204 : writeStatus)
          : json(writeBody ?? aBrew(body as Partial<Brew>), writeStatus === 200 ? 201 : writeStatus); // prettier-ignore

      return holdWrites ? held.then(() => answer) : answer;
    }

    return json({}, 404);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, releaseWrites: () => release() };
}
