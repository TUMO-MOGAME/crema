import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('sends JSON content type by default', async () => {
    respondWith({ status: 'ok' });

    await apiRequest('/api/health');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
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
