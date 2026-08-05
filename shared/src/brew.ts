import { z } from 'zod';
import { BREW_METHOD_SLUGS } from './brew-methods';

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
    .min(0, { message: `${label} is required` })
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

/** `GET /api/brews` query string. An absent method means "all methods". */
export const brewQuerySchema = z.object({
  method: brewMethodSchema.optional(),
});

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
