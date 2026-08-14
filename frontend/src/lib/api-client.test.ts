import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiRequest } from './api-client';

function respondWith(body: unknown, init: ResponseInit = {}) {
  const response = new Response(body === null ? null : JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('returns the parsed body on success', async () => {
    respondWith({ status: 'ok' });

    await expect(apiRequest<{ status: string }>('/api/health')).resolves.toEqual({ status: 'ok' });
  });

  it('returns nothing for a 204, which has no body to parse', async () => {
    respondWith(null, { status: 204 });

    await expect(apiRequest('/api/brews/abc')).resolves.toBeUndefined();
  });

  it('describes the body it sends', async () => {
    respondWith({ status: 'ok' });

    await apiRequest('/api/brews', {
      method: 'POST',
      body: JSON.stringify({ beans: 'Kenyan AA' }),
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  /**
   * `Content-Type: application/json` is not a CORS-safelisted request header,
   * so setting it on a request with no body bought a preflight for nothing —
   * two round trips to read a list. A GET has no content whose type could be
   * described, which is the reason it is safe to leave off as well as the
   * reason it is pointless to send.
   */
  it('does not describe a body it is not sending', async () => {
    respondWith({ status: 'ok' });

    await apiRequest('/api/health');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('rejects a success response that does not match the schema it was given', async () => {
    // A 200 with the wrong shape is a broken server, not a broken request —
    // and catching it here means the failure names the response instead of
    // surfacing as an unreadable undefined several components away.
    respondWith({ brews: 'not an array' });

    await expect(
      apiRequest('/api/brews', { schema: z.object({ brews: z.array(z.string()) }) }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('returns the parsed value when the schema accepts it', async () => {
    respondWith({ beans: 'Kenyan AA' });

    await expect(
      apiRequest('/api/brews/one', { schema: z.object({ beans: z.string() }) }),
    ).resolves.toEqual({ beans: 'Kenyan AA' });
  });

  it('unpacks the shared error envelope', async () => {
    respondWith(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'One or more fields are invalid.',
          details: [{ field: 'beans', message: 'Beans is required' }],
          requestId: 'req_123',
        },
      },
      { status: 400 },
    );

    const error = await apiRequest('/api/brews', { method: 'POST' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('VALIDATION_FAILED');
    expect((error as ApiError).requestId).toBe('req_123');
    expect((error as ApiError).fieldErrors).toEqual({ beans: 'Beans is required' });
  });

  it('still fails usefully when the body is not the expected envelope', async () => {
    respondWith('<html>502 Bad Gateway</html>', { status: 502 });

    const error = (await apiRequest('/api/health').catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
  });

  it('distinguishes an unreachable server from a server that answered', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = (await apiRequest('/api/health').catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
    expect(error.isRetryable).toBe(true);
  });

  it('bounds every request with a timeout signal, so a hung request has an exit', async () => {
    respondWith({ status: 'ok' });

    await apiRequest('/api/health');

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a timeout as the retryable network failure it is', async () => {
    // What `AbortSignal.timeout` makes fetch reject with when the deadline
    // passes. Simulated rather than waited for — the behaviour under test is
    // the mapping, not the clock.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError')),
    );

    const error = (await apiRequest('/api/health').catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.isRetryable).toBe(true);
    // A different sentence from the unreachable case: the server may be up and
    // slow, and telling someone to check their connection would misdirect them.
    expect(error.message).toContain('taking too long');
  });
});

describe('ApiError.isRetryable', () => {
  it.each([
    ['VALIDATION_FAILED', 400, false],
    ['NOT_FOUND', 404, false],
    ['RATE_LIMITED', 429, true],
    ['INTERNAL_ERROR', 500, true],
    ['AI_UNAVAILABLE', 503, true],
  ] as const)('is %s → %s', (code, status, expected) => {
    expect(new ApiError(code, 'x', status).isRetryable).toBe(expected);
  });
});
