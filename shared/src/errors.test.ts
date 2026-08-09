import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_STATUS, isApiErrorBody } from './errors.js';

const validBody = {
  error: {
    code: 'VALIDATION_FAILED',
    message: 'One or more fields are invalid.',
    details: [{ field: 'beans', message: 'Beans is required' }],
    requestId: 'req_123',
  },
};

describe('ERROR_STATUS', () => {
  it('maps every code, so no code can reach the client without a status', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code], `${code} has no status`).toBeGreaterThan(0);
    }
  });

  it('maps every code to a client or server error, never a success', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_STATUS[code]).toBeLessThan(600);
    }
  });

  it('uses the statuses the brief expects for the common cases', () => {
    expect(ERROR_STATUS.VALIDATION_FAILED).toBe(400);
    expect(ERROR_STATUS.NOT_FOUND).toBe(404);
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_STATUS.INTERNAL_ERROR).toBe(500);
  });

  it('answers an unconfigured coach with 503, not an error the user caused', () => {
    expect(ERROR_STATUS.AI_UNAVAILABLE).toBe(503);
  });
});

describe('isApiErrorBody', () => {
  it('accepts a well-formed envelope', () => {
    expect(isApiErrorBody(validBody)).toBe(true);
  });

  it('accepts one without the optional details', () => {
    expect(isApiErrorBody({ error: { code: 'NOT_FOUND', message: 'gone', requestId: 'r' } })).toBe(
      true,
    );
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'not an object'],
    ['a number', 42],
    ['an array', []],
    ['an empty object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isApiErrorBody(value)).toBe(false);
  });

  it('rejects a body with no error key', () => {
    expect(isApiErrorBody({ data: 'fine' })).toBe(false);
  });

  it('rejects an error that is not an object', () => {
    expect(isApiErrorBody({ error: 'something went wrong' })).toBe(false);
  });

  it('rejects a null error', () => {
    expect(isApiErrorBody({ error: null })).toBe(false);
  });

  it('rejects an error missing its code', () => {
    expect(isApiErrorBody({ error: { message: 'x', requestId: 'r' } })).toBe(false);
  });

  it('rejects an error missing its message', () => {
    expect(isApiErrorBody({ error: { code: 'NOT_FOUND', requestId: 'r' } })).toBe(false);
  });

  it('rejects a non-string message, which would break rendering', () => {
    expect(isApiErrorBody({ error: { code: 'NOT_FOUND', message: { text: 'x' } } })).toBe(false);
  });

  it('narrows the type, so the caller can read the envelope without a cast', () => {
    const payload: unknown = validBody;

    if (isApiErrorBody(payload)) {
      expect(payload.error.message).toBe('One or more fields are invalid.');
      expect(payload.error.details?.[0]?.field).toBe('beans');
    } else {
      expect.unreachable('the guard should have accepted a valid envelope');
    }
  });
});
