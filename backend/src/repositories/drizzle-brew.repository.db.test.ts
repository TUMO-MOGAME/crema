import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/client';
import { describeBrewRepositoryContract } from './brew.repository.contract';
import { DrizzleBrewRepository } from './drizzle-brew.repository';

/**
 * The dormant adapter, run against a real Postgres with the migrations applied.
 * See `vitest.db.config.ts` for how to bring one up.
 *
 * This is the file that makes "the Drizzle adapter is written but not
 * activated" mean something. It passes the same contract suite the in-memory
 * adapter passes, so switching `DATA_SOURCE` is a change with evidence behind
 * it rather than a hope.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for database tests. See vitest.db.config.ts.');
}

const { db, close } = createDatabase(connectionString);
const repository = new DrizzleBrewRepository(db);

const SEED_SQL = join(import.meta.dirname, '..', '..', '..', 'supabase', 'seed.sql');

/**
 * The contract suite needs an empty brews table, and the database it runs
 * against is shared — `schema.db.test.ts` asserts against the seeded demo rows,
 * and the `on delete restrict` test needs a brew that references a method.
 *
 * So this file borrows the table and puts it back. Without the restore the
 * suite would pass only while vitest happened to run these files in
 * alphabetical order, which is the sort of coupling that survives until the day
 * someone renames a file.
 */
afterAll(async () => {
  // Run inside a transaction the driver opened: `seed.sql` contains its own
  // `begin`/`commit`, and postgres.js refuses a transaction it did not start on
  // a pooled connection. `scripts/apply-migrations.mjs` does the same thing for
  // the same reason.
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(readFileSync(SEED_SQL, 'utf8')));
  });

  await close();
});

describeBrewRepositoryContract('DrizzleBrewRepository', {
  fresh: async () => {
    await db.execute(sql`delete from public.brews`);
    return repository;
  },
});

/**
 * Everything above is the shared contract. Everything below is about the row
 * underneath it — the parts of the schema the adapter relies on Postgres to get
 * right, which no in-memory store can prove.
 */

/** Extends `Record` because `db.execute` needs a row type with an index signature. */
interface StoredRow extends Record<string, unknown> {
  user_id: string | null;
  brew_ratio: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

async function rawRow(id: string): Promise<StoredRow> {
  const rows = await db.execute<StoredRow>(
    sql`select user_id, brew_ratio, deleted_at, created_at, updated_at
        from public.brews where id = ${id}`,
  );

  const [row] = rows;
  expect(row, `no row for brew ${id}`).toBeDefined();
  return row!;
}

const input = {
  beans: 'Kenyan AA',
  method: 'v60',
  coffeeGrams: 17,
  waterGrams: 272,
  rating: 5,
  tastingNotes: 'Grapefruit, blackberry, bright and juicy',
} as const;

describe('DrizzleBrewRepository against the real schema', () => {
  beforeEach(async () => {
    await db.execute(sql`delete from public.brews`);
  });

  it('lets Postgres compute the ratio rather than writing one', async () => {
    const brew = await repository.create(input);

    // 272 / 17 = 16, to the column's four decimal places.
    expect(Number((await rawRow(brew.id)).brew_ratio)).toBe(16);
  });

  it('writes a null owner, which is what v1 means by a brew', async () => {
    const brew = await repository.create(input);

    expect((await rawRow(brew.id)).user_id).toBeNull();
  });

  it('resolves the method slug through the lookup table', async () => {
    const brew = await repository.create({ ...input, method: 'moka-pot' });

    const rows = await db.execute<{ slug: string }>(
      sql`select m.slug from public.brews b
          join public.brew_methods m on m.id = b.method_id
          where b.id = ${brew.id}`,
    );

    expect(rows[0]?.slug).toBe('moka-pot');
  });

  it('lets the trigger move updated_at, rather than setting it from the app', async () => {
    const brew = await repository.create(input);
    const before = await rawRow(brew.id);

    await repository.update(brew.id, { rating: 2 });
    const after = await rawRow(brew.id);

    expect(Date.parse(after.updated_at)).toBeGreaterThan(Date.parse(before.updated_at));
    expect(after.created_at).toBe(before.created_at);
  });

  it('keeps the row on delete, so an accidental deletion is recoverable', async () => {
    const brew = await repository.create(input);

    await repository.softDelete(brew.id);

    // Invisible through the repository, still present in the table.
    await expect(repository.findById(brew.id)).resolves.toBeNull();
    expect((await rawRow(brew.id)).deleted_at).not.toBeNull();
  });

  it('rounds grams in the column, not in the adapter', async () => {
    const brew = await repository.create({ ...input, coffeeGrams: 18.567, waterGrams: 288.234 });

    // The adapter passes the value through untouched; `numeric(6,2)` is what
    // rounds it. The in-memory adapter has to do this itself to match, which is
    // the whole reason the contract suite asserts it on both.
    expect(brew.coffeeGrams).toBe(18.57);
    expect(brew.waterGrams).toBe(288.23);
  });

  it('refuses a brew method the lookup table does not have', async () => {
    const orphan = new DrizzleBrewRepository(db);

    await db.execute(sql`delete from public.brew_methods where slug = 'chemex'`);

    try {
      await expect(orphan.create({ ...input, method: 'chemex' })).rejects.toThrow(/brew_methods/);
    } finally {
      // Restored with its original id, so nothing else in the suite notices.
      await db.execute(
        sql`insert into public.brew_methods (id, slug, label, display_order)
            overriding system value values (5, 'chemex', 'Chemex', 5)`,
      );
    }
  });
});
