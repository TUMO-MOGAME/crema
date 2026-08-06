import {
  isBrewMethodSlug,
  type Brew,
  type BrewMethodSlug,
  type CreateBrewInput,
  type UpdateBrewInput,
} from '@crema/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { brewMethods, brews, type BrewRow, type NewBrewRow } from '../db/schema';
import { toIsoInstant, type BrewFilter, type BrewRepository } from './brew.repository';

/**
 * The Postgres adapter. Written, tested, and not switched on.
 *
 * The brief asks for the schema to be ready without a live database behind it.
 * Leaving the persistence layer unwritten would satisfy that literally and
 * leave the risky half of the work undone, so it is written instead and held to
 * the same contract suite as the adapter that ships — run against a real
 * Postgres in `drizzle-brew.repository.db.test.ts`, in the Database stage of
 * CI. Turning it on is `DATA_SOURCE=postgres` plus a `DATABASE_URL`. No
 * application code changes, and no adapter meeting production for the first
 * time on the day it is needed.
 *
 * Three things this adapter translates, so nothing above it has to know:
 *
 * - **Methods.** The domain says `'v60'`; the table says `method_id = 1`.
 * - **Deletion.** The domain says delete; the table sets `deleted_at` and every
 *   query filters it out.
 * - **Timestamps.** The driver returns whatever `timestamptz` gives it; the
 *   contract returns ISO instants.
 *
 * `brew_ratio` is read back but never written — it is a generated column, and
 * computing it here would be the beginning of it disagreeing with itself.
 */
export class DrizzleBrewRepository implements BrewRepository {
  private methodLookup: Promise<MethodLookup> | null = null;

  constructor(private readonly db: Database) {}

  async list(filter?: BrewFilter): Promise<Brew[]> {
    const methods = await this.methods();

    const conditions = [isNull(brews.deletedAt)];
    if (filter?.method !== undefined) {
      conditions.push(eq(brews.methodId, methodId(methods, filter.method)));
    }

    const rows = await this.db
      .select()
      .from(brews)
      .where(and(...conditions))
      // The tiebreakers keep the list stable between requests. `brewed_at desc`
      // alone leaves two brews logged for the same moment free to swap places.
      .orderBy(desc(brews.brewedAt), desc(brews.createdAt), asc(brews.id));

    return rows.map((row) => toBrew(row, methods));
  }

  async findById(id: string): Promise<Brew | null> {
    const methods = await this.methods();

    const [row] = await this.db
      .select()
      .from(brews)
      .where(and(eq(brews.id, id), isNull(brews.deletedAt)))
      .limit(1);

    return row ? toBrew(row, methods) : null;
  }

  async create(input: CreateBrewInput): Promise<Brew> {
    const methods = await this.methods();

    const values: NewBrewRow = {
      beans: input.beans,
      methodId: methodId(methods, input.method),
      coffeeGrams: input.coffeeGrams,
      waterGrams: input.waterGrams,
      rating: input.rating,
      tastingNotes: input.tastingNotes,
    };

    // Assigned conditionally rather than as `brewedAt: input.brewedAt`, so an
    // absent value leaves the column to its `default now()` instead of writing
    // an explicit null into a NOT NULL column.
    if (input.brewedAt !== undefined) values.brewedAt = toIsoInstant(input.brewedAt);

    const [row] = await this.db.insert(brews).values(values).returning();

    if (!row) throw new Error('The insert returned no row, which should be unreachable.');

    return toBrew(row, methods);
  }

  async update(id: string, changes: UpdateBrewInput): Promise<Brew | null> {
    const methods = await this.methods();

    const patch: Partial<NewBrewRow> = {};
    if (changes.beans !== undefined) patch.beans = changes.beans;
    if (changes.method !== undefined) patch.methodId = methodId(methods, changes.method);
    if (changes.coffeeGrams !== undefined) patch.coffeeGrams = changes.coffeeGrams;
    if (changes.waterGrams !== undefined) patch.waterGrams = changes.waterGrams;
    if (changes.rating !== undefined) patch.rating = changes.rating;
    if (changes.tastingNotes !== undefined) patch.tastingNotes = changes.tastingNotes;
    if (changes.brewedAt !== undefined) patch.brewedAt = toIsoInstant(changes.brewedAt);

    // Nothing to change is not an error, and `set({})` is invalid SQL. The read
    // still honours the soft delete, so a deleted brew answers null either way.
    if (Object.keys(patch).length === 0) return this.findById(id);

    // `updated_at` is deliberately absent: the `brews_set_updated_at` trigger
    // owns it. Setting it here would let a caller lie about it.
    const [row] = await this.db
      .update(brews)
      .set(patch)
      .where(and(eq(brews.id, id), isNull(brews.deletedAt)))
      .returning();

    return row ? toBrew(row, methods) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    // `now()` rather than a timestamp from this process: `deleted_at >=
    // created_at` is a CHECK constraint, and the database is the only clock
    // that is guaranteed to agree with the one that wrote `created_at`.
    const deleted = await this.db
      .update(brews)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(brews.id, id), isNull(brews.deletedAt)))
      .returning({ id: brews.id });

    // The `deleted_at is null` guard is what makes a second delete report
    // false instead of silently moving the deletion time.
    return deleted.length > 0;
  }

  /**
   * The method vocabulary, read once per instance.
   *
   * It is reference data that only a migration can change, so re-reading it on
   * every request would be a join on every query to learn something that cannot
   * have moved. A rejected load is not cached, or one failed request during a
   * cold start would poison the instance for its whole life.
   */
  private methods(): Promise<MethodLookup> {
    this.methodLookup ??= this.loadMethods().catch((error: unknown) => {
      this.methodLookup = null;
      throw error;
    });

    return this.methodLookup;
  }

  private async loadMethods(): Promise<MethodLookup> {
    const rows = await this.db
      .select({ id: brewMethods.id, slug: brewMethods.slug })
      .from(brewMethods);

    const idBySlug = new Map<BrewMethodSlug, number>();
    const slugById = new Map<number, BrewMethodSlug>();

    for (const row of rows) {
      // A slug the shared vocabulary does not know is skipped rather than
      // rejected: a method added to the table ahead of the code should not stop
      // the API serving brews that use the methods it does know about.
      if (!isBrewMethodSlug(row.slug)) continue;

      idBySlug.set(row.slug, row.id);
      slugById.set(row.id, row.slug);
    }

    return { idBySlug, slugById };
  }
}

interface MethodLookup {
  idBySlug: ReadonlyMap<BrewMethodSlug, number>;
  slugById: ReadonlyMap<number, BrewMethodSlug>;
}

/**
 * A method's row id.
 *
 * Missing means `0002_brew_methods.sql` has not been applied, or has been
 * applied and then edited. Both are deployment faults rather than bad input, so
 * this fails loudly instead of returning an empty list and letting someone
 * conclude they have no brews.
 */
function methodId(methods: MethodLookup, slug: BrewMethodSlug): number {
  const id = methods.idBySlug.get(slug);

  if (id === undefined) {
    throw new Error(
      `The brew method "${slug}" is missing from the brew_methods table. ` +
        'Apply the migrations before serving requests.',
    );
  }

  return id;
}

function toBrew(row: BrewRow, methods: MethodLookup): Brew {
  const method = methods.slugById.get(row.methodId);

  if (method === undefined) {
    throw new Error(
      `Brew ${row.id} references brew method id ${row.methodId}, which @crema/shared ` +
        'does not know about. The vocabulary and the lookup table have drifted.',
    );
  }

  return {
    id: row.id,
    beans: row.beans,
    method,
    coffeeGrams: row.coffeeGrams,
    waterGrams: row.waterGrams,
    rating: row.rating,
    tastingNotes: row.tastingNotes,
    brewedAt: toIsoInstant(row.brewedAt),
    createdAt: toIsoInstant(row.createdAt),
    updatedAt: toIsoInstant(row.updatedAt),
  };
}
