import {
  brewMethodLabel,
  BREW_METHOD_SLUGS,
  BREW_PAGE,
  EMPTY_BREW_STATS,
  type Brew,
  type BrewMethodSlug,
  type BrewMethodStats,
  type BrewPage,
  type BrewStats,
  type CreateBrewInput,
  type UpdateBrewInput,
} from '@crema/shared';
import { randomUUID } from 'node:crypto';
import {
  roundTo,
  toIsoInstant,
  toStoredGrams,
  toStoredRatio,
  type BrewFilter,
  type BrewRepository,
} from './brew.repository';

/**
 * The adapter v1 runs on.
 *
 * Not a stub and not a test double — it is the production persistence layer
 * until Supabase is switched on, which is why it enforces the same storage
 * rules Postgres would rather than storing whatever it is handed. Soft delete,
 * two-decimal grams, UTC instants and copy-on-read all behave here exactly as
 * they behave there, because the contract suite fails if they do not.
 *
 * Everything is synchronous underneath; the promises exist because the
 * interface is shaped for a database and the caller must not be able to tell
 * which adapter it has.
 */
export class InMemoryBrewRepository implements BrewRepository {
  /** Keyed by id. Holds deleted brews too — they are hidden, not removed. */
  private readonly brews = new Map<string, StoredBrew>();

  constructor(seed: readonly CreateBrewInput[] = []) {
    for (const input of seed) this.insert(input);
  }

  list(filter?: BrewFilter): Promise<BrewPage> {
    const matching = [...this.brews.values()]
      .filter((brew) => brew.deletedAt === null)
      .filter((brew) => filter?.method === undefined || brew.method === filter.method)
      .sort(byMostRecentlyBrewed);

    // The total is counted before the page is cut, which is the whole point of
    // returning it: it describes the filter, not the slice.
    const limit = filter?.limit ?? BREW_PAGE.defaultLimit;
    const offset = filter?.offset ?? 0;

    return Promise.resolve({
      brews: matching.slice(offset, offset + limit).map(toBrew),
      total: matching.length,
      limit,
      offset,
    });
  }

  findById(id: string): Promise<Brew | null> {
    const stored = this.live(id);
    return Promise.resolve(stored ? toBrew(stored) : null);
  }

  create(input: CreateBrewInput): Promise<Brew> {
    return Promise.resolve(toBrew(this.insert(input)));
  }

  update(id: string, changes: UpdateBrewInput): Promise<Brew | null> {
    const stored = this.live(id);
    if (!stored) return Promise.resolve(null);

    // Assigned field by field rather than spread: a spread would copy keys
    // present-but-undefined over good values, and `exactOptionalPropertyTypes`
    // does not stop that when the source is a parsed partial.
    if (changes.beans !== undefined) stored.beans = changes.beans;
    if (changes.method !== undefined) stored.method = changes.method;
    if (changes.coffeeGrams !== undefined) stored.coffeeGrams = toStoredGrams(changes.coffeeGrams);
    if (changes.waterGrams !== undefined) stored.waterGrams = toStoredGrams(changes.waterGrams);
    if (changes.rating !== undefined) stored.rating = changes.rating;
    if (changes.tastingNotes !== undefined) stored.tastingNotes = changes.tastingNotes;
    if (changes.brewedAt !== undefined) stored.brewedAt = toIsoInstant(changes.brewedAt);

    stored.updatedAt = new Date().toISOString();

    return Promise.resolve(toBrew(stored));
  }

  softDelete(id: string): Promise<boolean> {
    const stored = this.live(id);
    if (!stored) return Promise.resolve(false);

    const now = new Date().toISOString();
    stored.deletedAt = now;
    // Postgres bumps this from the `brews_set_updated_at` trigger, which fires
    // on the soft delete too. Nothing reads it on a hidden row; it is here so
    // the two stores hold the same bytes, not just answer the same questions.
    stored.updatedAt = now;

    return Promise.resolve(true);
  }

  /**
   * The same aggregates `brew_stats` and `brew_stats_by_method` produce.
   *
   * Written to match the SQL rather than to be idiomatic JavaScript: ratios
   * come from `toStoredRatio` because Postgres averages the stored generated
   * column, and each aggregate is rounded to the same number of decimals the
   * view rounds it to. Getting either wrong would show up as a stats panel
   * whose numbers changed when the storage adapter did.
   */
  stats(): Promise<BrewStats> {
    const live = [...this.brews.values()].filter((brew) => brew.deletedAt === null);

    if (live.length === 0) return Promise.resolve({ ...EMPTY_BREW_STATS, byMethod: [] });

    const ratios = live.map((brew) => toStoredRatio(brew.coffeeGrams, brew.waterGrams));
    const brewedAt = live.map((brew) => Date.parse(brew.brewedAt));

    const byMethod = [...groupByMethod(live).entries()]
      .map(([method, brews]) => methodStats(method, brews))
      .sort(byBrewCountThenDisplayOrder);

    return Promise.resolve({
      brewCount: live.length,
      averageRating: roundTo(mean(live.map((brew) => brew.rating)), 2),
      averageRatio: roundTo(mean(ratios), 1),
      methodsUsed: byMethod.length,
      firstBrewedAt: new Date(Math.min(...brewedAt)).toISOString(),
      lastBrewedAt: new Date(Math.max(...brewedAt)).toISOString(),
      byMethod,
    });
  }

  private insert(input: CreateBrewInput): StoredBrew {
    const now = new Date().toISOString();

    const stored: StoredBrew = {
      id: randomUUID(),
      beans: input.beans,
      method: input.method,
      coffeeGrams: toStoredGrams(input.coffeeGrams),
      waterGrams: toStoredGrams(input.waterGrams),
      rating: input.rating,
      tastingNotes: input.tastingNotes,
      brewedAt: input.brewedAt === undefined ? now : toIsoInstant(input.brewedAt),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.brews.set(stored.id, stored);
    return stored;
  }

  /** The brew under this id, unless it is deleted — in which case there isn't one. */
  private live(id: string): StoredBrew | undefined {
    const stored = this.brews.get(id);
    return stored?.deletedAt === null ? stored : undefined;
  }
}

/** A row as this adapter holds it: the API shape plus the soft delete marker. */
interface StoredBrew extends Brew {
  deletedAt: string | null;
}

/**
 * Mirrors `order by brewed_at desc, created_at desc, id asc`.
 *
 * The tiebreakers matter more than they look: two brews logged for the same
 * moment must not swap places between requests, or the list reshuffles under
 * the user for no reason they can see.
 */
function byMostRecentlyBrewed(a: StoredBrew, b: StoredBrew): number {
  return (
    Date.parse(b.brewedAt) - Date.parse(a.brewedAt) ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function groupByMethod(brews: StoredBrew[]): Map<BrewMethodSlug, StoredBrew[]> {
  const grouped = new Map<BrewMethodSlug, StoredBrew[]>();

  for (const brew of brews) {
    const existing = grouped.get(brew.method);
    if (existing) existing.push(brew);
    else grouped.set(brew.method, [brew]);
  }

  return grouped;
}

function methodStats(method: BrewMethodSlug, brews: StoredBrew[]): BrewMethodStats {
  const ratios = brews.map((brew) => toStoredRatio(brew.coffeeGrams, brew.waterGrams));

  return {
    method,
    label: brewMethodLabel(method),
    brewCount: brews.length,
    averageRating: roundTo(mean(brews.map((brew) => brew.rating)), 2),
    averageRatio: roundTo(mean(ratios), 1),
    minRatio: roundTo(Math.min(...ratios), 1),
    maxRatio: roundTo(Math.max(...ratios), 1),
    lastBrewedAt: new Date(
      Math.max(...brews.map((brew) => Date.parse(brew.brewedAt))),
    ).toISOString(),
  };
}

/**
 * Most-brewed first.
 *
 * The tiebreak is the vocabulary's display order rather than anything derived
 * from the data, so two methods with the same count appear in the order the
 * filter dropdown lists them instead of an order that changes as brews are
 * added.
 */
function byBrewCountThenDisplayOrder(a: BrewMethodStats, b: BrewMethodStats): number {
  return (
    b.brewCount - a.brewCount ||
    BREW_METHOD_SLUGS.indexOf(a.method) - BREW_METHOD_SLUGS.indexOf(b.method)
  );
}

/**
 * A copy, without the soft delete marker the API never shows.
 *
 * The rest element is what makes it a copy. Returning the stored object would
 * hand a caller the map's own entry, and the contract suite's isolation tests
 * are there because that mistake is invisible until something mutates a
 * response and corrupts the store.
 */
function toBrew({ deletedAt: _deletedAt, ...brew }: StoredBrew): Brew {
  return brew;
}
