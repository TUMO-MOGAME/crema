import { isApiErrorBody, type ApiErrorBody } from '@crema/shared';
import { describe, expect, it } from 'vitest';
import { createApp, MAX_BODY_BYTES } from './app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('responds 200', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('reports which persistence adapter is live', async () => {
    const res = await app.request('/api/health');
    const body = (await res.json()) as { status: string; dataSource: string };

    expect(body.status).toBe('ok');
    expect(['memory', 'postgres']).toContain(body.dataSource);
  });

  it('tells the client whether the coach is available on this deployment', async () => {
    const res = await app.request('/api/health');
    const body = (await res.json()) as { ai: { enabled: boolean; model: string | null } };

    expect(typeof body.ai.enabled).toBe('boolean');
    // Without a key configured the model is withheld rather than advertised.
    if (!body.ai.enabled) expect(body.ai.model).toBeNull();
  });
});

describe('unmatched routes', () => {
  it('responds 404 in the shared error envelope', async () => {
    const res = await app.request('/api/nothing-here');
    expect(res.status).toBe(404);

    const body: unknown = await res.json();
    expect(isApiErrorBody(body)).toBe(true);
  });

  it('names the method and path so the client can log something useful', async () => {
    const res = await app.request('/api/nothing-here', { method: 'POST' });
    const body = (await res.json()) as { error: { code: string; message: string } };

    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('POST');
    expect(body.error.message).toContain('/api/nothing-here');
  });

  it('attaches a request id for correlating with server logs', async () => {
    const res = await app.request('/api/nothing-here');
    const body = (await res.json()) as { error: { requestId: string } };

    expect(body.error.requestId).toBeTruthy();
    expect(body.error.requestId).not.toBe('unknown');
  });
});

describe('security headers', () => {
  it('are applied to every response', async () => {
    const res = await app.request('/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('cors', () => {
  it('answers a preflight for the configured origin', async () => {
    const res = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('does not hand an allow-origin header to an unlisted origin', async () => {
    const res = await app.request('/api/health', {
      headers: { Origin: 'https://not-our-frontend.example' },
    });

    expect(res.headers.get('access-control-allow-origin')).not.toBe(
      'https://not-our-frontend.example',
    );
  });
});

/**
 * The body limit, and why it is not a validation rule.
 *
 * Zod runs after the body has been parsed, so `beans` being capped at 120
 * characters said nothing about a caller who sends two hundred megabytes — the
 * whole thing is in memory before a schema sees it. On routes that require no
 * authentication that is a denial of service costing one request.
 */
describe('request body size', () => {
  const brew = {
    beans: 'Ethiopian Yirgacheffe',
    method: 'v60',
    coffeeGrams: 18,
    waterGrams: 288,
    rating: 5,
    tastingNotes: 'Blackcurrant, jasmine, tea-like and clean',
  };

  async function post(body: string): Promise<Response> {
    return await app.request('/api/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }

  it('refuses a body past the limit with 413', async () => {
    const oversized = JSON.stringify({ ...brew, tastingNotes: 'x'.repeat(MAX_BODY_BYTES) });

    const response = await post(oversized);

    expect(response.status).toBe(413);
  });

  it('uses the shared error envelope for it', async () => {
    const response = await post(JSON.stringify({ ...brew, beans: 'x'.repeat(MAX_BODY_BYTES) }));
    const body: unknown = await response.json();

    expect(isApiErrorBody(body)).toBe(true);
    expect((body as ApiErrorBody).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('names a limit the caller can aim under', async () => {
    const response = await post(JSON.stringify({ ...brew, beans: 'x'.repeat(MAX_BODY_BYTES) }));
    const body = (await response.json()) as ApiErrorBody;

    expect(body.error.message).toContain('16 KB');
  });

  it('lets a real brew through untouched', async () => {
    // The largest brew the schema accepts is nowhere near the ceiling.
    const response = await post(
      JSON.stringify({ ...brew, beans: 'x'.repeat(120), tastingNotes: 'y'.repeat(500) }),
    );

    expect(response.status).toBe(201);
  });
});

describe('content security policy', () => {
  it('is set, because Hono\u2019s defaults do not set one', async () => {
    const res = await app.request('/api/health');

    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('forbids this JSON API from being framed', async () => {
    const res = await app.request('/api/health');

    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
});
