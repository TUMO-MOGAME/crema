import type { RequestIdVariables } from 'hono/request-id';

/**
 * The typed context every route in this app is built against.
 *
 * Declared once here so `c.get('requestId')` is type-safe everywhere rather
 * than returning `any` and quietly disabling type checking in error paths.
 */
export interface AppEnv {
  Variables: RequestIdVariables;
}
