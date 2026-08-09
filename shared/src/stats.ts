import { z } from 'zod';
import { brewMethodSchema } from './brew.js';

/**
 * What `GET /api/stats` returns.
 *
 * The shape mirrors the `brew_stats` and `brew_stats_by_method` views in
 * `supabase/migrations/0006_views.sql`, including how they round: ratings to
 * two decimals, ratios to one. The in-memory adapter computes the same numbers
 * the same way, and the repository contract suite asserts the two agree — a
 * stats panel that changed its numbers when the storage adapter changed would
 * be a strange thing to explain.
 *
 * Every average is nullable because an empty log has no average. The views
 * express that by returning no rows at all; the API turns that into an explicit
 * zero state, so the client never has to tell "no brews" apart from "no answer".
 */

const isoTimestamp = z.string().datetime({ offset: true });

/** One method's numbers. Never present unless the method has at least one brew. */
export const brewMethodStatsSchema = z.object({
  method: brewMethodSchema,
  label: z.string(),
  brewCount: z.number().int().positive(),
  averageRating: z.number(),
  averageRatio: z.number(),
  minRatio: z.number(),
  maxRatio: z.number(),
  lastBrewedAt: isoTimestamp,
});

export const brewStatsSchema = z.object({
  brewCount: z.number().int().nonnegative(),
  averageRating: z.number().nullable(),
  averageRatio: z.number().nullable(),
  methodsUsed: z.number().int().nonnegative(),
  firstBrewedAt: isoTimestamp.nullable(),
  lastBrewedAt: isoTimestamp.nullable(),

  /** Most-brewed method first, ties broken by the vocabulary's display order. */
  byMethod: z.array(brewMethodStatsSchema),
});

export type BrewMethodStats = z.infer<typeof brewMethodStatsSchema>;
export type BrewStats = z.infer<typeof brewStatsSchema>;

/** The answer for a log with nothing in it. */
export const EMPTY_BREW_STATS: BrewStats = {
  brewCount: 0,
  averageRating: null,
  averageRatio: null,
  methodsUsed: 0,
  firstBrewedAt: null,
  lastBrewedAt: null,
  byMethod: [],
};
