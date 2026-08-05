import { ERROR_STATUS } from '@crema/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from './app-error';

describe('AppError', () => {
  it('derives its status from the shared code map rather than hardcoding one', () => {
    expect(new AppError('NOT_FOUND', 'x').status).toBe(ERROR_STATUS.NOT_FOUND);
    expect(new AppError('RATE_LIMITED', 'x').status).toBe(ERROR_STATUS.RATE_LIMITED);
    expect(new AppError('INTERNAL_ERROR', 'x').status).toBe(ERROR_STATUS.INTERNAL_ERROR);
  });

  it('is a real Error, so it survives instanceof and stack capture', () => {
    const error = new AppError('NOT_FOUND', 'gone');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.stack).toBeTruthy();
  });

  it('names the resource and id when it has one', () => {
    expect(AppError.notFound('Brew', 'abc').message).toBe('Brew abc was not found.');
  });

  it('falls back to naming just the resource', () => {
    expect(AppError.notFound('Brew').message).toBe('Brew was not found.');
  });

  it('carries field details through a validation failure', () => {
    const error = AppError.validation([{ field: 'beans', message: 'Beans is required' }]);

    expect(error.status).toBe(400);
    expect(error.details).toHaveLength(1);
  });

  it('leaves details undefined when none were supplied', () => {
    expect(AppError.notFound('Brew').details).toBeUndefined();
  });

  it('tells the caller how long to wait when rate limited', () => {
    expect(AppError.rateLimited(30).message).toContain('30 seconds');
  });

  it('describes an unconfigured coach as a deployment fact, not a fault', () => {
    const error = AppError.aiUnavailable();

    expect(error.status).toBe(503);
    expect(error.message).toMatch(/not configured/i);
  });
});
