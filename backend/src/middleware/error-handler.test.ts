import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';
import type { AppEnv } from '../types';
import { errorHandler, notFoundHandler } from './error-handler';

/** A throwaway app whose only route throws, so the handler can be exercised directly. */
function appThatThrows(thrown: unknown): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requestId());
  app.get('/boom', () => {
    throw thrown;
  });
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

interface ErrorPayload {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
    requestId: string;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppError responses', () => {
  it('maps a not-found to 404', async () => {
    const res = await appThatThrows(AppError.notFound('Brew', 'abc')).request('/boom');
    const body = (await res.json()) as ErrorPayload;

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('abc');
  });

  it('maps a validation failure to 400 and preserves the field details', async () => {
    const thrown = AppError.validation([
      { field: 'coffeeGrams', message: 'Must be greater than 0' },
    ]);
    const res = await appThatThrows(thrown).request('/boom');
    const body = (await res.json()) as ErrorPayload;

    expect(res.status).toBe(400);
    expect(body.error.details).toEqual([
      { field: 'coffeeGrams', message: 'Must be greater than 0' },
    ]);
  });

  it('maps rate limiting to 429 and tells the client when to come back', async () => {
    const res = await appThatThrows(AppError.rateLimited(60)).request('/boom');

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('maps an unconfigured coach to 503 without implying the app is broken', async () => {
    const res = await appThatThrows(AppError.aiUnavailable()).request('/boom');
    const body = (await res.json()) as ErrorPayload;

    expect(res.status).toBe(503);
    expect(body.error.code).toBe('AI_UNAVAILABLE');
    expect(body.error.message).toMatch(/every other feature works/i);
  });

  it('omits the details key entirely when there are none', async () => {
    const res = await appThatThrows(AppError.notFound('Brew')).request('/boom');
    const body = (await res.json()) as ErrorPayload;

    expect(body.error).not.toHaveProperty('details');
  });
});

describe('unexpected errors', () => {
  it('answers 500 without leaking the message or the stack', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await appThatThrows(new Error('connection string is postgres://u:p@h/db')).request(
      '/boom',
    );
    const raw = await res.text();

    expect(res.status).toBe(500);
    expect(raw).not.toContain('postgres://');
    expect(raw).toContain('Something went wrong');
  });

  it('logs the real error so it is recoverable from the server side', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await appThatThrows(new Error('kaboom')).request('/boom');

    expect(logged).toHaveBeenCalledOnce();
    const line = JSON.parse(logged.mock.calls[0]![0] as string) as {
      level: string;
      message: string;
      path: string;
      requestId: string;
    };
    expect(line.level).toBe('error');
    expect(line.message).toBe('kaboom');
    expect(line.path).toBe('/boom');
    expect(line.requestId).toBeTruthy();
  });

  it('still returns a request id the user can quote back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await appThatThrows(new Error('kaboom')).request('/boom');
    const body = (await res.json()) as ErrorPayload;

    expect(body.error.requestId).toBeTruthy();
  });
});
