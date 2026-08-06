import { BREW_METHODS, BREW_METHOD_SLUGS, brewMethodLabel } from '@crema/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The brew method vocabulary exists twice: as a TypeScript constant the API
 * validates against, and as seeded rows the `brews.method_id` foreign key
 * points at. Both are necessary — the first gives a 400 with a useful message,
 * the second makes an invalid method unrepresentable.
 *
 * Two copies means they can disagree, and the failure would be quiet and ugly:
 * the API accepts a method, then the insert fails with a foreign key violation
 * and the user gets a 500 for a request that was actually valid input.
 *
 * This reads the migration and compares. No database required, so it runs in
 * the normal unit suite on every commit rather than only when Postgres is up.
 */

const MIGRATION = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '0002_brew_methods.sql',
);

interface SeededMethod {
  slug: string;
  label: string;
  displayOrder: number;
}

function seededMethods(): SeededMethod[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const values = /insert into public\.brew_methods[^;]+;/i.exec(sql);

  expect(values, 'no brew_methods insert found in the migration').not.toBeNull();

  const rows = [...values![0].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*\)/g)];

  return rows.map((row) => ({
    slug: row[1]!,
    label: row[2]!,
    displayOrder: Number(row[3]!),
  }));
}

describe('brew method vocabulary', () => {
  const seeded = seededMethods();

  it('seeds every method the API accepts', () => {
    expect(seeded.map((method) => method.slug).sort()).toEqual([...BREW_METHOD_SLUGS].sort());
  });

  it('seeds no method the API would reject', () => {
    for (const method of seeded) {
      expect(BREW_METHOD_SLUGS, `${method.slug} is in the database but not the contract`).toContain(
        method.slug,
      );
    }
  });

  it('uses the same label on both sides', () => {
    for (const method of seeded) {
      expect(method.label).toBe(brewMethodLabel(method.slug as (typeof BREW_METHOD_SLUGS)[number]));
    }
  });

  it('orders the dropdown the same way the constant does', () => {
    const byOrder = [...seeded]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((method) => method.slug);

    expect(byOrder).toEqual(BREW_METHODS.map((method) => method.slug));
  });

  it('numbers display_order contiguously from one', () => {
    const orders = seeded.map((method) => method.displayOrder).sort((a, b) => a - b);

    expect(orders).toEqual(Array.from({ length: seeded.length }, (_, index) => index + 1));
  });
});
