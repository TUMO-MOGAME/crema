import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { createQueryClient } from './query-client';

type RetryFn = (failureCount: number, error: Error) => boolean;

function retryPolicy(): RetryFn {
  const retry = createQueryClient().getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') throw new Error('Expected a retry function');
  return retry;
}

describe('query retry policy', () => {
  it('does not retry a client error, which would fail identically', () => {
    const shouldRetry = retryPolicy();

    expect(shouldRetry(0, new ApiError('VALIDATION_FAILED', 'bad', 400))).toBe(false);
    expect(shouldRetry(0, new ApiError('NOT_FOUND', 'gone', 404))).toBe(false);
  });

  it('retries a server error and an unreachable server', () => {
    const shouldRetry = retryPolicy();

    expect(shouldRetry(0, new ApiError('INTERNAL_ERROR', 'oops', 500))).toBe(true);
    expect(shouldRetry(0, new ApiError('NETWORK_ERROR', 'offline', 0))).toBe(true);
  });

  it('gives up after two attempts rather than hammering a failing server', () => {
    const shouldRetry = retryPolicy();

    expect(shouldRetry(1, new ApiError('INTERNAL_ERROR', 'oops', 500))).toBe(true);
    expect(shouldRetry(2, new ApiError('INTERNAL_ERROR', 'oops', 500))).toBe(false);
  });

  it('retries an unrecognised error, since it cannot be ruled out', () => {
    expect(retryPolicy()(0, new Error('something else'))).toBe(true);
  });

  it('never retries mutations, which are not safe to repeat blindly', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
