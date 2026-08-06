import { isApiErrorBody } from '@crema/shared';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './error-handler';
import { rateLimit } from './rate-limit';
import type { AppEnv } from '../types';

/**
 * Built per test with a tiny limit rather than by driving the real app past 120
 * requests. The behaviour under test is the counting, and a test that needs a
 * hundred round trips to assert it is a slow test that proves the same thing.
 */
function appWith(limit: number, windowMs = 60_000): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // `trustProxy` on, because these cases are about the counting and they
  // identify callers by header. The cases that are about *whether* the header
  // may be believed build their own app below.
  app.use('*', rateLimit({ limit, windowMs, trustProxy: true }));
  app.get('/thing', (c) => c.json({ ok: true }));
  app.onError(errorHandler);

  return app;
}

/** The default posture: forwarding headers are not evidence of anything. */
function untrustingAppWith(limit: number): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', rateLimit({ limit, windowMs: 60_000 }));
  app.get('/thing', (c) => c.json({ ok: true }));
  app.onError(errorHandler);

  return app;
}

const from = (ip: string): RequestInit => ({ headers: { 'x-forwarded-for': ip } });

describe('rate limiting', () => {
  it('lets requests through up to the limit', async () => {
    const app = appWith(3);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await app.request('/thing', from('203.0.113.1'));
      expect(response.status, `request ${attempt} should have been allowed`).toBe(200);
    }
  });

  it('answers 429 once the limit is passed', async () => {
    const app = appWith(2);

    await app.request('/thing', from('203.0.113.2'));
    await app.request('/thing', from('203.0.113.2'));
    const response = await app.request('/thing', from('203.0.113.2'));

    expect(response.status).toBe(429);
  });

  it('uses the shared error envelope, like every other failure', async () => {
    const app = appWith(1);

    await app.request('/thing', from('203.0.113.3'));
    const response = await app.request('/thing', from('203.0.113.3'));
    const body: unknown = await response.json();

    expect(isApiErrorBody(body)).toBe(true);
    expect((body as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });

  it('says when to come back, in the header and the message', async () => {
    const app = appWith(1, 30_000);

    await app.request('/thing', from('203.0.113.4'));
    const response = await app.request('/thing', from('203.0.113.4'));
    const retryAfter = Number(response.headers.get('Retry-After'));
    const body = (await response.json()) as { error: { message: string } };

    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(30);
    // The header and the prose come from the same number, so they cannot drift.
    expect(body.error.message).toContain(String(retryAfter));
  });

  it('counts each caller separately', async () => {
    const app = appWith(1);

    await app.request('/thing', from('203.0.113.5'));
    const sameCaller = await app.request('/thing', from('203.0.113.5'));
    const otherCaller = await app.request('/thing', from('203.0.113.6'));

    expect(sameCaller.status).toBe(429);
    expect(otherCaller.status).toBe(200);
  });

  it('takes the first entry of a forwarded chain, not the whole header', async () => {
    const app = appWith(1);

    await app.request('/thing', from('203.0.113.7, 70.41.3.18'));
    const response = await app.request('/thing', {
      headers: { 'x-forwarded-for': '203.0.113.7, 150.172.238.178' },
    });

    // Same client, different proxies behind it. Counting the whole chain would
    // hand a caller a fresh budget every time a hop changed.
    expect(response.status).toBe(429);
  });

  it('falls back to x-real-ip when there is no forwarded header', async () => {
    const app = appWith(1);

    await app.request('/thing', { headers: { 'x-real-ip': '203.0.113.8' } });
    const response = await app.request('/thing', { headers: { 'x-real-ip': '203.0.113.8' } });

    expect(response.status).toBe(429);
  });

  it('starts a new window once the old one expires', async () => {
    // A one-millisecond window: the second request lands after it closed.
    const app = appWith(1, 1);

    await app.request('/thing', from('203.0.113.9'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const response = await app.request('/thing', from('203.0.113.9'));

    expect(response.status).toBe(200);
  });

  /**
   * The header is trivially forged, so believing it unconditionally turned the
   * limiter into a suggestion: one client, a fresh `x-forwarded-for` per
   * request, and the budget never runs out. These cases pin the behaviour that
   * closed that, in both directions.
   */
  describe('when the deployment does not sit behind a trusted proxy', () => {
    it('does not let a forged forwarded header buy a fresh budget', async () => {
      const app = untrustingAppWith(1);

      await app.request('/thing', from('203.0.113.20'));
      // A different header value, and in a trusting deployment a different
      // caller. Here it is the same one, inventing names.
      const response = await app.request('/thing', from('198.51.100.77'));

      expect(response.status).toBe(429);
    });

    it('does not let x-real-ip buy one either', async () => {
      const app = untrustingAppWith(1);

      await app.request('/thing', { headers: { 'x-real-ip': '203.0.113.21' } });
      const response = await app.request('/thing', { headers: { 'x-real-ip': '198.51.100.78' } });

      expect(response.status).toBe(429);
    });

    it('still lets a caller through up to the limit', async () => {
      const app = untrustingAppWith(2);

      expect((await app.request('/thing')).status).toBe(200);
      expect((await app.request('/thing')).status).toBe(200);
      expect((await app.request('/thing')).status).toBe(429);
    });
  });

  it('gives each app its own budget, so one test cannot exhaust another', async () => {
    const one = appWith(1);
    const other = appWith(1);

    await one.request('/thing', from('203.0.113.10'));
    const response = await other.request('/thing', from('203.0.113.10'));

    expect(response.status).toBe(200);
  });
});
