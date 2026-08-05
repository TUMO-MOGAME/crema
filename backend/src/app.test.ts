import { isApiErrorBody } from '@crema/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

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
