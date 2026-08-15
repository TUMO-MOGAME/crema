import { z } from 'zod';

/**
 * Environment configuration, validated once at boot.
 *
 * The point of parsing here rather than reading `process.env` at the call site
 * is that a misconfigured deployment fails immediately with a readable message,
 * instead of surfacing three days later as an `undefined` in a request handler.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    /** Comma-separated list of origins permitted to call the API. */
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),

    /** Which persistence adapter to build. See PLANNING.md section 5. */
    DATA_SOURCE: z.enum(['memory', 'postgres']).default('memory'),

    DATABASE_URL: z.string().optional(),

    /**
     * Whether the database connection is encrypted, and how far it is trusted.
     *
     * `postgres.js` defaults to no TLS and the Supabase pooler does not insist,
     * so an unset option meant every query and the password itself crossed the
     * public internet in the clear. It defaults to `require` here for the
     * reason every security default exists: the safe answer should be the one
     * you get by saying nothing.
     *
     * - `require` encrypts but accepts whatever certificate is presented. It
     *   stops eavesdropping, not impersonation.
     * - `verify` additionally checks the certificate against `DATABASE_CA_CERT`,
     *   which closes both. Supabase signs the pooler with its own CA, so the
     *   certificate has to be supplied — Node's trust store rejects it.
     * - `disable` is plaintext, for a local container on a loopback address.
     *   Refused in production below.
     */
    DATABASE_SSL: z.enum(['require', 'verify', 'disable']).default('require'),

    /**
     * The CA certificate `verify` checks against, PEM encoded. Downloaded from
     * the Supabase dashboard: Settings → Database → SSL configuration.
     *
     * Not a secret — a CA certificate is published so it can be checked against
     * — but it lives in the environment rather than the repository because it
     * is per-project and rotates on its own schedule.
     */
    DATABASE_CA_CERT: z.string().min(1).optional(),

    /**
     * Requests per minute per caller, across the whole API.
     *
     * Generous on purpose: it exists to stop a runaway client, not to shape
     * traffic. See `middleware/rate-limit.ts` for why it is a courtesy limit
     * rather than a guarantee.
     */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),

    /**
     * Absent by design in most environments. Every AI surface degrades to a
     * clean 503 without it, and the rest of the app is unaffected.
     */
    GEMINI_API_KEY: z.string().min(1).optional(),

    GEMINI_MODEL: z.string().min(1).default('gemini-flash-latest'),

    AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),

    /**
     * Whether `x-forwarded-for` may be believed.
     *
     * Off by default, because the header is trivially forged by anyone talking
     * to the process directly, and the rate limiter keys on it. Turn it on only
     * where a proxy you control overwrites the header on every request —
     * Vercel does. See `middleware/rate-limit.ts`.
     */
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((value, ctx) => {
    if (value.DATA_SOURCE === 'postgres' && !value.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when DATA_SOURCE is "postgres".',
      });
    }

    /**
     * The in-memory adapter is a real persistence layer, but only for a process
     * that outlives the requests it serves. Production runs as serverless
     * functions: the store lives inside one ephemeral instance, so a write is
     * lost at the next cold start and is invisible to every sibling instance in
     * the meantime.
     *
     * That failure is silent — the API answers 201, the row is really there,
     * and it is gone by the next request. Refusing to boot converts it into the
     * one thing it is not on its own: something you find out about.
     */
    /**
     * `verify` without a certificate cannot verify anything, and failing at
     * boot is better than failing on the first query — or worse, appearing to
     * verify while checking against a trust store that will never contain
     * Supabase's own CA.
     */
    if (value.DATABASE_SSL === 'verify' && !value.DATABASE_CA_CERT) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_CA_CERT'],
        message:
          'DATABASE_CA_CERT is required when DATABASE_SSL is "verify". Download it from the ' +
          'Supabase dashboard under Settings → Database → SSL configuration.',
      });
    }

    /**
     * The same reasoning as the in-memory store below: a plaintext connection
     * to a database that is a network hop away is a silent failure — it works,
     * it is fast, and it publishes every row and the password to anything on
     * the path. Local development against a container on loopback is the case
     * `disable` exists for, and production is not it.
     */
    if (value.NODE_ENV === 'production' && value.DATABASE_SSL === 'disable') {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_SSL'],
        message:
          'DATABASE_SSL "disable" cannot be used in production — the connection would carry ' +
          'every query and the database password in the clear. Use "require", or "verify" with ' +
          'DATABASE_CA_CERT.',
      });
    }

    if (value.NODE_ENV === 'production' && value.DATA_SOURCE === 'memory') {
      ctx.addIssue({
        code: 'custom',
        path: ['DATA_SOURCE'],
        message:
          'DATA_SOURCE "memory" cannot be used in production — the store is per-instance and ' +
          'does not survive a cold start, so writes would be lost silently. ' +
          'Set DATA_SOURCE=postgres and provide DATABASE_URL.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        'Copy .env.example to .env and fill in the missing values.',
    );
  }

  return result.data;
}

export const env: Env = loadEnv();

/** AI routes check this rather than reaching for the key directly. */
export const isAiEnabled = (config: Env = env): boolean => config.GEMINI_API_KEY !== undefined;
