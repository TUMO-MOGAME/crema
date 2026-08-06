import type {
  Brew,
  BrewMethodSlug,
  BrewStats,
  CreateBrewInput,
  UpdateBrewInput,
} from '@crema/shared';

/**
 * The persistence contract for brews.
 *
 * Two adapters implement it — `InMemoryBrewRepository`, which runs v1, and
 * `DrizzleBrewRepository`, which is written and tested but not activated. Both
 * are held to the same suite in `brew.repository.contract.ts`, so "swap the
 * adapter" is a claim with a test behind it rather than an intention.
 *
 * Everything here speaks the domain's language: `Brew` from `@crema/shared`,
 * and brew methods as slugs. Nothing above this layer knows that Postgres
 * stores a `method_id` pointing at a lookup table, or that a delete is really
 * an update. That translation is each adapter's problem.
 *
 * Two conventions the whole contract depends on:
 *
 * - **Ids are UUIDs.** Postgres rejects anything else with a type error rather
 *   than an empty result, so callers validate the shape before asking. A
 *   well-formed id that matches nothing is the "not found" case; a malformed
 *   one never reaches here.
 * - **Missing means `null`, never a throw.** Deciding that a missing brew is a
 *   404 is a rule about HTTP, and HTTP is three layers up.
 *
 * There is no `userId` parameter yet. v1 runs as a single implicit user and
 * every row carries `user_id = null`; when authentication lands it becomes an
 * argument here and a `where` clause in the adapters, which is a smaller change
 * than it would have been without the table column already in place.
 */
export interface BrewRepository {
  /** Live brews, newest brew date first. */
  list(filter?: BrewFilter): Promise<Brew[]>;

  /** `null` when no live brew has that id. */
  findById(id: string): Promise<Brew | null>;

  create(input: CreateBrewInput): Promise<Brew>;

  /** `null` when no live brew has that id. Absent fields are left alone. */
  update(id: string, changes: UpdateBrewInput): Promise<Brew | null>;

  /**
   * Soft delete: the row survives, `deleted_at` is set, and every read path
   * stops seeing it. `false` when there was no live brew to delete, which is
   * also what a second delete of the same brew returns.
   */
  softDelete(id: string): Promise<boolean>;

  /**
   * Aggregates over the live brews.
   *
   * On the interface rather than computed in a service, because Postgres has
   * `brew_stats` and `brew_stats_by_method` and making it read every brew into
   * memory to add them up would be pretending the database is a filing
   * cabinet. Deleted brews are excluded, as everywhere else.
   */
  stats(): Promise<BrewStats>;
}

/** An absent `method` means every method, not "no method". */
export interface BrewFilter {
  method?: BrewMethodSlug;
}

/* -------------------------------------------------------------------------
 * Storage rules
 *
 * Postgres applies these itself, by virtue of its column types. The in-memory
 * adapter has to apply them deliberately, because a JavaScript `Map` will
 * happily store things Postgres would round or normalise — and an adapter that
 * accepts what the other one changes is a bug waiting for the day the
 * environment variable flips. The contract suite asserts both behave the same.
 * ---------------------------------------------------------------------- */

/** `coffee_grams numeric(6,2)` and `water_grams numeric(7,2)` both keep two decimals. */
export function toStoredGrams(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * `brew_ratio numeric(10,4) generated always as (water_grams / coffee_grams)`.
 *
 * Four decimals, because that is the column the aggregates in
 * `brew_stats_by_method` average over. `brewRatio()` in `@crema/shared` rounds
 * to one decimal and is a different thing — it is for display, where `1:16.5`
 * is the number people actually say out loud.
 */
export function toStoredRatio(coffeeGrams: number, waterGrams: number): number {
  return Math.round((waterGrams / coffeeGrams) * 10_000) / 10_000;
}

/** `round(avg(...), n)`, matching how the views present each aggregate. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * One instant, written one way.
 *
 * `timestamptz` keeps an instant, not the offset it arrived in, so a brew sent
 * as `12:00:00+02:00` reads back as `10:00:00Z`. The in-memory adapter
 * normalises on write to match, which also means the ISO strings sort
 * chronologically as plain strings — the two are the same guarantee.
 *
 * The parameter is wider than the Drizzle schema's `mode: 'string'` suggests
 * because the driver's own type parsers can hand back a `Date`, and a mapper
 * that silently produced `"Invalid Date"` would fail somewhere far from here.
 */
export function toIsoInstant(value: string | Date): string {
  const instant = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(instant.getTime())) {
    throw new TypeError(`Not a readable timestamp: ${String(value)}`);
  }

  return instant.toISOString();
}
