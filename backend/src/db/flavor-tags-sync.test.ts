import { FLAVOR_TAGS, flavorTagLabel, FLAVOR_TAG_SLUGS } from '@crema/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The flavour vocabulary exists twice, for the same reasons the brew methods
 * do: a TypeScript constant the AI providers are typed against, and seeded
 * rows the `brew_flavor_tags.tag_id` foreign key points at. A tag the model
 * may propose but the table has never heard of would surface as a foreign key
 * violation on a request that was valid input.
 *
 * This reads the migration and compares, exactly as the methods sync test
 * does — no database required, so it runs on every commit.
 */

const MIGRATION = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '0004_flavor_tags.sql',
);

interface SeededTag {
  slug: string;
  label: string;
}

function seededTags(): SeededTag[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const values = /insert into public\.flavor_tags[^;]+;/i.exec(sql);

  expect(values, 'no flavor_tags insert found in the migration').not.toBeNull();

  const rows = [...values![0].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)];

  return rows.map((row) => ({ slug: row[1]!, label: row[2]! }));
}

describe('flavour tag vocabulary', () => {
  const seeded = seededTags();

  it('seeds every tag the providers may extract', () => {
    expect(seeded.map((tag) => tag.slug).sort()).toEqual([...FLAVOR_TAG_SLUGS].sort());
  });

  it('uses the same label on both sides', () => {
    for (const tag of seeded) {
      expect(tag.label).toBe(flavorTagLabel(tag.slug as (typeof FLAVOR_TAG_SLUGS)[number]));
    }
  });

  it('seeds in the order the constant lists, because id order is display order', () => {
    // `flavorTagsFor` sorts by tag id, and ids are assigned in seed order —
    // so the seed order *is* the vocabulary order the API serves. A reorder
    // in one place without the other would quietly reorder every tag list.
    expect(seeded.map((tag) => tag.slug)).toEqual(FLAVOR_TAGS.map((tag) => tag.slug));
  });
});
