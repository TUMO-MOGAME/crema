import { createBrewSchema } from '@crema/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEED_BREWS, seedBrewInputs } from './seed-brews.js';

/**
 * The demo brews exist twice: as SQL for a seeded Postgres, and as a TypeScript
 * fixture for the in-memory adapter that actually runs v1.
 *
 * Two copies can disagree, and this one would disagree quietly — the app would
 * look right in development and different after the database is switched on,
 * which is the worst kind of difference to find late. So this reads the SQL and
 * compares. No database required, so it runs on every commit.
 *
 * Same approach as `db/brew-methods-sync.test.ts`, for the same reason.
 */

const SEED_SQL = join(import.meta.dirname, '..', '..', '..', 'supabase', 'seed.sql');

interface SqlSeedBrew {
  beans: string;
  method: string;
  coffeeGrams: number;
  waterGrams: number;
  rating: number;
  tastingNotes: string;
  daysAgo: number;
}

/** Pulls the rows out of the `from (values ...) as v` block in `seed.sql`. */
function sqlSeedBrews(): SqlSeedBrew[] {
  const sql = readFileSync(SEED_SQL, 'utf8');
  const block = /from \(values([\s\S]*?)\) as v \(/.exec(sql);

  expect(block, 'no brew values block found in seed.sql').not.toBeNull();

  const rows = [
    ...block![1]!.matchAll(
      /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*(\d+)\s*\)/g,
    ),
  ];

  return rows.map((row) => ({
    beans: row[1]!,
    method: row[2]!,
    coffeeGrams: Number(row[3]!),
    waterGrams: Number(row[4]!),
    rating: Number(row[5]!),
    tastingNotes: row[6]!,
    daysAgo: Number(row[7]!),
  }));
}

describe('the demo brews', () => {
  it('are the same rows in the fixture and in seed.sql', () => {
    const fromSql = sqlSeedBrews();

    expect(fromSql.length).toBeGreaterThan(0);
    expect(SEED_BREWS).toEqual(fromSql);
  });

  it('are all valid input, so seeding cannot produce a brew the API would reject', () => {
    for (const input of seedBrewInputs()) {
      const result = createBrewSchema.safeParse(input);
      expect(result.success, `${input.beans}: ${result.error?.message ?? ''}`).toBe(true);
    }
  });

  it('start with the three brews from the wireframes', () => {
    expect(SEED_BREWS.slice(0, 3).map((brew) => brew.beans)).toEqual([
      'Zimbabwean highlands',
      'Nigerian dark roast',
      'Italian decaf',
    ]);
  });

  it('include enough V60s at different ratios for the coach to have an answer', () => {
    const v60s = SEED_BREWS.filter((brew) => brew.method === 'v60');
    const ratios = new Set(v60s.map((brew) => brew.waterGrams / brew.coffeeGrams));

    expect(v60s.length).toBeGreaterThanOrEqual(4);
    expect(ratios.size).toBeGreaterThanOrEqual(4);
  });
});
