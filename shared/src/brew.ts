import { z } from 'zod';
import { BREW_METHOD_SLUGS } from './brew-methods.js';

/**
 * Field limits.
 *
 * These numbers appear in three places and must agree in all three: here, in
 * the SQL `CHECK` constraints in `supabase/migrations/0003_brews.sql`, and in
 * the `max`/`maxLength` attributes on the form inputs. Changing one without the
 * others is the classic way validation drifts, so they are exported rather than
 * inlined and the migration references this file by name in a comment.
 */
export const BREW_LIMITS = {
  beansMaxLength: 120,
  tastingNotesMaxLength: 500,
  coffeeGramsMin: 0.1,
  coffeeGramsMax: 500,
  waterGramsMin: 1,
  waterGramsMax: 5000,
  ratingMin: 1,
  ratingMax: 5,
} as const;

/**
 * The brief requires that neither the create nor the edit form can be submitted
 * with a blank field. Trimming before the length check is what makes a value of
 * "   " fail rather than pass.
 */
const requiredText = (label: string, maxLength: number) =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} is required` })
    .max(maxLength, { message: `${label} must be ${maxLength} characters or fewer` });

const grams = (label: string, min: number, max: number) =>
  z
    .number({ message: `${label} must be a number` })
    .finite({ message: `${label} must be a number` })
    .min(min, { message: `${label} must be at least ${min}` })
    .max(max, { message: `${label} must be no more than ${max}` });

const isoTimestamp = z.string().datetime({ offset: true });

export const brewMethodSchema = z.enum(BREW_METHOD_SLUGS);

/** A brew as the API returns it. */
export const brewSchema = z.object({
  id: z.string().uuid(),
  beans: requiredText('Beans', BREW_LIMITS.beansMaxLength),
  method: brewMethodSchema,
  coffeeGrams: grams('Coffee grams', BREW_LIMITS.coffeeGramsMin, BREW_LIMITS.coffeeGramsMax),
  waterGrams: grams('Water grams', BREW_LIMITS.waterGramsMin, BREW_LIMITS.waterGramsMax),
  rating: z
    .number()
    .int({ message: 'Rating must be a whole number' })
    .min(BREW_LIMITS.ratingMin, { message: `Rating must be at least ${BREW_LIMITS.ratingMin}` })
    .max(BREW_LIMITS.ratingMax, { message: `Rating must be at most ${BREW_LIMITS.ratingMax}` }),
  tastingNotes: requiredText('Tasting notes', BREW_LIMITS.tastingNotesMaxLength),
  brewedAt: isoTimestamp,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

/**
 * `POST /api/brews` body. Server-owned fields are not accepted from the client.
 * `brewedAt` is optional because most brews are logged as they happen, but the
 * field exists so yesterday's brew can still be recorded honestly.
 */
export const createBrewSchema = brewSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ brewedAt: isoTimestamp.optional() })
  .strict();

/** `PATCH /api/brews/:id` body. Partial, but never empty. */
export const updateBrewSchema = createBrewSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

/**
 * Paging limits.
 *
 * `default` is what a caller who says nothing gets, and it is deliberately
 * larger than a first screenful so the common case is one request. `max` is the
 * ceiling a caller can ask for, and it exists because `GET /api/brews` used to
 * return the entire log — fine at twelve brews, a growing unbounded read at
 * four thousand, and the kind of thing that is only ever noticed in production.
 */
export const BREW_PAGE = {
  defaultLimit: 50,
  maxLimit: 200,
} as const;

/**
 * `GET /api/brews` query string. An absent method means "all methods".
 *
 * `limit` and `offset` arrive as strings from the query string and are coerced,
 * but only from something numeric — `z.coerce.number()` alone turns `"abc"`
 * into `NaN` and an empty string into `0`, both of which would be accepted as
 * "a number" and then behave strangely. The regex makes a malformed page a 400
 * that names the parameter.
 */
const pageNumber = (label: string) =>
  z
    .string()
    .regex(/^\d+$/, { message: `${label} must be a whole number` })
    .transform(Number);

export const brewQuerySchema = z.object({
  method: brewMethodSchema.optional(),

  limit: pageNumber('limit')
    .pipe(
      z
        .number()
        .int()
        .min(1, { message: 'limit must be at least 1' })
        .max(BREW_PAGE.maxLimit, { message: `limit must be no more than ${BREW_PAGE.maxLimit}` }),
    )
    .optional(),

  offset: pageNumber('offset').pipe(z.number().int().min(0)).optional(),
});

/**
 * One page of brews, plus what the client needs to ask for the next one.
 *
 * `total` is the count of brews matching the filter, not the count in this
 * page, so a client can render "12 of 340" without a second request. It is the
 * reason this is an envelope rather than a bare array: the array alone cannot
 * say how much of the log it represents.
 */
export const brewPageSchema = z.object({
  brews: z.array(brewSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type BrewPage = z.infer<typeof brewPageSchema>;

export type Brew = z.infer<typeof brewSchema>;
export type CreateBrewInput = z.infer<typeof createBrewSchema>;
export type UpdateBrewInput = z.infer<typeof updateBrewSchema>;
export type BrewQuery = z.infer<typeof brewQuerySchema>;

/**
 * Water-to-coffee ratio, the number specialty brewers actually compare.
 *
 * Postgres computes this as a stored generated column, so this helper exists
 * only for the in-memory adapter and for optimistic UI updates. Both round the
 * same way, so a value never visibly changes when the server response lands.
 */
export function brewRatio(coffeeGrams: number, waterGrams: number): number {
  if (coffeeGrams <= 0) return 0;
  return Math.round((waterGrams / coffeeGrams) * 10) / 10;
}

/** Formats a ratio the way it is written on a bag: `1:16.5`. */
export function formatBrewRatio(coffeeGrams: number, waterGrams: number): string {
  return `1:${brewRatio(coffeeGrams, waterGrams)}`;
}
