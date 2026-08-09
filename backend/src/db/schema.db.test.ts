import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from './schema.js';

/**
 * Runs against a live Postgres with the migrations applied. See
 * `vitest.db.config.ts` for how to bring one up.
 *
 * Two jobs. First, a drift guard: the Drizzle definitions and the SQL are
 * maintained by hand in two files, and this is what stops them diverging.
 * Second, proving the constraints actually reject what they claim to — a CHECK
 * nobody has ever seen fire is a comment with extra syntax.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for database tests. See vitest.db.config.ts.');
}

// onnotice is overridden to keep Postgres NOTICE output out of the test report.
const sql = postgres(connectionString, { max: 1, onnotice: () => undefined });

afterAll(async () => {
  await sql.end();
});

/** Postgres internal type names, mapped to what Drizzle emits. */
const TYPE_ALIASES: Record<string, string> = {
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  timestamptz: 'timestamp with time zone',
  timestamp: 'timestamp without time zone',
  bool: 'boolean',
  varchar: 'character varying',
  float8: 'double precision',
};

function normaliseType(raw: string): string {
  const bare = raw.toLowerCase().replace(/"/g, '').replace(/\(.*$/, '').replace(/\[\]$/, '').trim();
  return TYPE_ALIASES[bare] ?? bare;
}

/**
 * Every table exported from the schema module, introspected once.
 *
 * A loop rather than `.filter()` with a type predicate: the module also exports
 * enums and types, so the union of `Object.values` is wider than `PgTable` and a
 * predicate narrowing to it is not assignable. Drizzle's `is()` narrows
 * correctly inside a conditional.
 */
const drizzleTables: { name: string; config: ReturnType<typeof getTableConfig> }[] = [];

for (const value of Object.values(schema)) {
  if (is(value, PgTable)) {
    const config = getTableConfig(value);
    drizzleTables.push({ name: config.name, config });
  }
}

interface DbColumn {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  is_generated: 'ALWAYS' | 'NEVER';
}

let dbColumns: DbColumn[] = [];

beforeAll(async () => {
  dbColumns = await sql<DbColumn[]>`
    select table_name, column_name, udt_name, is_nullable, is_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
      )
  `;
});

describe('schema drift', () => {
  it('applied the migrations before running', () => {
    expect(dbColumns.length).toBeGreaterThan(0);
  });

  it('declares every table that exists in the database', async () => {
    const inDatabase = (
      await sql<{ table_name: string }[]>`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
      `
    )
      .map((row) => row.table_name)
      .sort();

    const inDrizzle = drizzleTables.map((table) => table.name).sort();

    expect(inDrizzle).toEqual(inDatabase);
  });

  // Enumerated per table so a failure names the table rather than dumping every
  // column in the schema.
  it.each(drizzleTables.map((table) => [table.name, table.config] as const))(
    'matches the database definition of %s',
    (tableName, config) => {
      const actual = dbColumns.filter((column) => column.table_name === tableName);

      expect(actual.length, `no columns found for ${tableName}`).toBeGreaterThan(0);

      const declared = config.columns
        .map((column) => ({
          name: column.name,
          type: normaliseType(column.getSQLType()),
          nullable: !column.notNull,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const observed = actual
        .map((column) => ({
          name: column.column_name,
          type: normaliseType(column.udt_name),
          nullable: column.is_nullable === 'YES',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      expect(declared).toEqual(observed);
    },
  );
});

describe('brew constraints', () => {
  const insert = (overrides: Record<string, unknown> = {}) => {
    const brew = {
      beans: 'Constraint test',
      coffee_grams: 18,
      water_grams: 300,
      rating: 4,
      tasting_notes: 'Testing',
      ...overrides,
    };

    return sql`
      insert into brews (beans, method_id, coffee_grams, water_grams, rating, tasting_notes)
      values (
        ${brew.beans},
        (select id from brew_methods where slug = 'v60'),
        ${brew.coffee_grams},
        ${brew.water_grams},
        ${brew.rating},
        ${brew.tasting_notes}
      )
      returning id, brew_ratio
    `;
  };

  it('accepts a valid brew', async () => {
    const [row] = await insert();
    expect(row?.id).toBeTruthy();
    await sql`delete from brews where id = ${row!.id as string}`;
  });

  it.each([
    ['blank beans', { beans: '' }],
    ['whitespace-only beans', { beans: '   ' }],
    ['blank tasting notes', { tasting_notes: '' }],
    ['whitespace-only tasting notes', { tasting_notes: '  \t ' }],
    ['zero coffee', { coffee_grams: 0 }],
    ['negative coffee', { coffee_grams: -5 }],
    ['absurd coffee dose', { coffee_grams: 501 }],
    ['zero water', { water_grams: 0 }],
    ['absurd water volume', { water_grams: 5001 }],
    // The two floors 0008 tightened. `numeric(6,2)` can hold 0.01 and the
    // original `> 0` accepted it, while BREW_LIMITS has always said 0.1 — so
    // the database would take a row the contract could not describe.
    ['coffee below the shared minimum', { coffee_grams: 0.05 }],
    ['water below the shared minimum', { water_grams: 0.5 }],
    ['rating below range', { rating: 0 }],
    ['rating above range', { rating: 6 }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(insert(overrides)).rejects.toThrow();
  });

  it('computes brew_ratio rather than trusting the caller', async () => {
    const [row] = await insert({ coffee_grams: 18, water_grams: 288 });

    expect(Number(row?.brew_ratio)).toBeCloseTo(16, 4);
    await sql`delete from brews where id = ${row!.id as string}`;
  });

  it('refuses a written brew_ratio, because it is generated', async () => {
    await expect(
      sql`
        insert into brews (beans, method_id, coffee_grams, water_grams, rating, tasting_notes, brew_ratio)
        values ('x', (select id from brew_methods where slug = 'v60'), 18, 300, 4, 'x', 99)
      `,
    ).rejects.toThrow();
  });

  it('maintains updated_at by trigger', async () => {
    const [row] = await insert();
    const id = row!.id as string;

    const [before] = await sql`select updated_at from brews where id = ${id}`;
    await sql`update brews set rating = 5 where id = ${id}`;
    const [after] = await sql`select updated_at from brews where id = ${id}`;

    expect(new Date(after!.updated_at as string).getTime()).toBeGreaterThan(
      new Date(before!.updated_at as string).getTime(),
    );

    await sql`delete from brews where id = ${id}`;
  });

  it('refuses an unknown brew method', async () => {
    await expect(
      sql`
        insert into brews (beans, method_id, coffee_grams, water_grams, rating, tasting_notes)
        values ('x', 32767, 18, 300, 4, 'x')
      `,
    ).rejects.toThrow();
  });

  it('refuses to delete a brew method that brews still reference', async () => {
    // The referencing brew is arranged here rather than assumed, and the
    // difference is not stylistic. This test used to rely on a v60 brew left
    // behind by seed.sql, so it passed in CI — which always seeds — while
    // silently depending on data it never asked for.
    //
    // Against a migrated but unseeded database the assumption inverts: nothing
    // references v60, so the delete the test expects to be refused succeeds
    // instead. The failure is not the assertion. It is that the row is now
    // gone, and every later test that inserts a v60 brew fails on a null
    // method_id. One unmet precondition cost the vocabulary a row and the run
    // 52 failures, and none of them named the cause.
    const [row] = await insert();

    try {
      await expect(sql`delete from brew_methods where slug = 'v60'`).rejects.toThrow();
    } finally {
      await sql`delete from brews where id = ${row!.id as string}`;
    }
  });
});

describe('ai suggestion audit trail', () => {
  it('refuses a pending suggestion that claims to be resolved', async () => {
    await expect(
      sql`
        insert into ai_suggestions (payload, status, resolved_at)
        values ('{}'::jsonb, 'pending', now())
      `,
    ).rejects.toThrow();
  });

  it('refuses a decided suggestion with no resolution time', async () => {
    await expect(
      sql`insert into ai_suggestions (payload, status) values ('{}'::jsonb, 'rejected')`,
    ).rejects.toThrow();
  });

  it('refuses to link a brew unless the suggestion was accepted', async () => {
    await expect(
      sql`
        insert into ai_suggestions (payload, status, resolved_at, brew_id)
        values ('{}'::jsonb, 'rejected', now(), (select id from brews limit 1))
      `,
    ).rejects.toThrow();
  });

  it('accepts the one shape that is legitimate', async () => {
    const [row] = await sql`
      insert into ai_suggestions (payload, status, resolved_at, brew_id)
      values ('{"beans":"x"}'::jsonb, 'accepted', now(), (select id from brews limit 1))
      returning id
    `;

    expect(row?.id).toBeTruthy();
    await sql`delete from ai_suggestions where id = ${row!.id as string}`;
  });

  it('refuses a payload that is not an object', async () => {
    await expect(
      sql`insert into ai_suggestions (payload) values ('"just a string"'::jsonb)`,
    ).rejects.toThrow();
  });
});

describe('flavour tag provenance', () => {
  it('refuses a confidence score on a human-applied tag', async () => {
    await expect(
      sql`
        insert into brew_flavor_tags (brew_id, tag_id, source, confidence)
        values (
          (select id from brews limit 1),
          (select id from flavor_tags where slug = 'nutty'),
          'human',
          0.9
        )
      `,
    ).rejects.toThrow();
  });

  it('treats tag slugs case-insensitively, so duplicates cannot creep in', async () => {
    await expect(
      sql`insert into flavor_tags (slug, label) values ('Chocolate', 'Chocolate')`,
    ).rejects.toThrow();
  });
});

describe('row level security', () => {
  it('is enabled on every table', async () => {
    const unprotected = await sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and rowsecurity = false
    `;

    expect(unprotected.map((row) => row.tablename)).toEqual([]);
  });

  it('gives every table at least one policy', async () => {
    const withoutPolicies = await sql<{ tablename: string }[]>`
      select t.tablename
      from pg_tables t
      where t.schemaname = 'public'
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = t.tablename
        )
    `;

    expect(withoutPolicies.map((row) => row.tablename)).toEqual([]);
  });

  it('runs views with the caller rights, not the definer', async () => {
    const views = await sql<{ viewname: string; options: string[] | null }[]>`
      select c.relname as viewname, c.reloptions as options
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
    `;

    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      // Postgres normalises the reloption to `on`; accept either spelling
      // rather than depending on how it chose to store it.
      const invoker = (view.options ?? []).some((option) =>
        /^security_invoker=(on|true)$/.test(option),
      );
      expect(invoker, `${view.viewname} is not security_invoker`).toBe(true);
    }
  });
});

describe('soft delete', () => {
  it('keeps the row and excludes it from the stats view', async () => {
    const [created] = await sql`
      insert into brews (beans, method_id, coffee_grams, water_grams, rating, tasting_notes)
      values ('Soft delete test', (select id from brew_methods where slug = 'chemex'), 20, 320, 5, 'x')
      returning id
    `;
    const id = created!.id as string;

    const [before] = await sql`select brew_count from brew_stats`;
    await sql`update brews set deleted_at = now() where id = ${id}`;
    const [after] = await sql`select brew_count from brew_stats`;
    const [stillThere] = await sql`select id from brews where id = ${id}`;

    expect(Number(after!.brew_count)).toBe(Number(before!.brew_count) - 1);
    expect(stillThere).toBeTruthy();

    await sql`delete from brews where id = ${id}`;
  });

  it('refuses a deletion timestamp that predates creation', async () => {
    await expect(
      sql`
        insert into brews (beans, method_id, coffee_grams, water_grams, rating, tasting_notes, deleted_at)
        values ('x', (select id from brew_methods where slug = 'v60'), 18, 300, 4, 'x', now() - interval '1 day')
      `,
    ).rejects.toThrow();
  });
});
