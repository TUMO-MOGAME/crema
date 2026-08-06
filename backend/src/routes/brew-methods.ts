import { BREW_METHODS } from '@crema/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../types';

/**
 * The brew method vocabulary, in display order.
 *
 * Served from `@crema/shared` rather than read from `brew_methods`, and that is
 * a deliberate choice rather than a shortcut. The table is the same list — a
 * test reads the migration and asserts it, and the Database stage proves the
 * foreign key holds — so a query would cost a round trip to learn something the
 * process already knows and cannot get wrong.
 *
 * What the endpoint buys is that the frontend stops carrying its own copy. The
 * filter dropdown and the method select read this, so adding a brew method is
 * one migration and one constant, and no UI change at all.
 */
export const brewMethodRoutes = new Hono<AppEnv>().get('/brew-methods', (c) =>
  c.json(BREW_METHODS),
);
