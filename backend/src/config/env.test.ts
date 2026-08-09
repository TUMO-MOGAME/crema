import { describe, expect, it } from 'vitest';
import { isAiEnabled, loadEnv } from './env.js';

describe('loadEnv', () => {
  it('runs on defaults with nothing configured', () => {
    const env = loadEnv({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATA_SOURCE).toBe('memory');
  });

  it('coerces numeric values that arrive as strings', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => loadEnv({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown data source rather than falling back silently', () => {
    expect(() => loadEnv({ DATA_SOURCE: 'mongodb' })).toThrow(/DATA_SOURCE/);
  });

  it('refuses postgres without a connection string', () => {
    expect(() => loadEnv({ DATA_SOURCE: 'postgres' })).toThrow(/DATABASE_URL/);
  });

  it('accepts postgres once a connection string is supplied', () => {
    const env = loadEnv({
      DATA_SOURCE: 'postgres',
      DATABASE_URL: 'postgresql://user:pass@host:6543/postgres',
    });

    expect(env.DATA_SOURCE).toBe('postgres');
  });

  it('splits a comma-separated origin list', () => {
    const env = loadEnv({ CORS_ORIGIN: 'http://localhost:5173, https://crema-web.vercel.app' });

    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5173', 'https://crema-web.vercel.app']);
  });

  it('points at the missing values instead of failing vaguely', () => {
    expect(() => loadEnv({ DATA_SOURCE: 'postgres' })).toThrow(/Copy .env.example/);
  });
});

describe('isAiEnabled', () => {
  it('is false when no key is configured, which is the default', () => {
    expect(isAiEnabled(loadEnv({}))).toBe(false);
  });

  it('is true once a key is present', () => {
    expect(isAiEnabled(loadEnv({ GEMINI_API_KEY: 'test-key' }))).toBe(true);
  });

  it('treats an empty key as absent rather than valid', () => {
    expect(() => loadEnv({ GEMINI_API_KEY: '' })).toThrow(/GEMINI_API_KEY/);
  });
});

/**
 * The combination that loses data without saying so.
 *
 * The in-memory adapter is a real persistence layer for a process that outlives
 * its requests. Production is serverless, where it is not: a write succeeds,
 * answers 201, and is gone at the next cold start — with no error anywhere to
 * suggest it. Refusing to boot is the only signal that failure mode has.
 */
describe('the adapter a production deployment may use', () => {
  it('refuses the in-memory store in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DATA_SOURCE/);
  });

  it('says why, and what to do instead', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/cold start|DATA_SOURCE=postgres/);
  });

  it('allows postgres in production', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      DATA_SOURCE: 'postgres',
      DATABASE_URL: 'postgres://crema:crema@localhost:5432/crema',
    });

    expect(env.DATA_SOURCE).toBe('postgres');
  });

  it('still allows the in-memory store outside production', () => {
    // Development and test both want the seeded adapter and neither loses
    // anything by using it.
    expect(loadEnv({ NODE_ENV: 'development' }).DATA_SOURCE).toBe('memory');
    expect(loadEnv({ NODE_ENV: 'test' }).DATA_SOURCE).toBe('memory');
  });
});

describe('TRUST_PROXY', () => {
  it('does not trust forwarding headers unless told to', () => {
    expect(loadEnv({}).TRUST_PROXY).toBe(false);
  });

  it('reads the flag when it is set', () => {
    expect(loadEnv({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
  });

  it('rejects a value that is neither, rather than guessing', () => {
    expect(() => loadEnv({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });
});
