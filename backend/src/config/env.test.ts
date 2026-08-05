import { describe, expect, it } from 'vitest';
import { isAiEnabled, loadEnv } from './env';

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
