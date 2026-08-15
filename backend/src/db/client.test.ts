import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import { sslOption } from './client.js';

/**
 * The encryption decision, which is worth a test precisely because its failure
 * is silent: a connection with no TLS works, is fast, and publishes every row
 * and the password to anything on the path. Nothing observable breaks, so only
 * an assertion notices.
 */

const postgresEnv = (overrides: Record<string, string> = {}) =>
  loadEnv({
    DATA_SOURCE: 'postgres',
    DATABASE_URL: 'postgres://crema:crema@db.example.com:6543/crema',
    ...overrides,
  });

describe('sslOption', () => {
  it('encrypts by default, because the safe answer is the one you get for free', () => {
    expect(sslOption(postgresEnv())).toBe('require');
  });

  it('verifies the certificate when told to, and against the supplied CA', () => {
    const option = sslOption(postgresEnv({ DATABASE_SSL: 'verify', DATABASE_CA_CERT: 'PEM' }));

    // Node's own trust store would reject Supabase's pooler certificate, so
    // verification without a CA is not a stricter mode — it is a broken one.
    expect(option).toEqual({ rejectUnauthorized: true, ca: 'PEM' });
  });

  it('goes plaintext only when a deployment says so outright', () => {
    expect(sslOption(postgresEnv({ DATABASE_SSL: 'disable' }))).toBe(false);
  });
});

describe('the environment loader', () => {
  it('refuses "verify" with nothing to verify against', () => {
    expect(() => postgresEnv({ DATABASE_SSL: 'verify' })).toThrow(/DATABASE_CA_CERT/);
  });

  it('refuses a plaintext connection in production', () => {
    // The same shape of refusal as the in-memory store in production: a
    // configuration that works and quietly costs you everything.
    expect(() => postgresEnv({ NODE_ENV: 'production', DATABASE_SSL: 'disable' })).toThrow(
      /in the clear/,
    );
  });

  it('allows plaintext outside production, for a container on loopback', () => {
    expect(postgresEnv({ NODE_ENV: 'development', DATABASE_SSL: 'disable' }).DATABASE_SSL).toBe(
      'disable',
    );
  });

  it('encrypts by default in production without anything being set', () => {
    expect(postgresEnv({ NODE_ENV: 'production' }).DATABASE_SSL).toBe('require');
  });
});
