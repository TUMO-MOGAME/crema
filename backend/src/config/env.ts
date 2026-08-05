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
     * Absent by design in most environments. Every AI surface degrades to a
     * clean 503 without it, and the rest of the app is unaffected.
     */
    GEMINI_API_KEY: z.string().min(1).optional(),

    GEMINI_MODEL: z.string().min(1).default('gemini-flash-latest'),

    AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  })
  .superRefine((value, ctx) => {
    if (value.DATA_SOURCE === 'postgres' && !value.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when DATA_SOURCE is "postgres".',
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
