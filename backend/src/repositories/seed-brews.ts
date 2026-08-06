import type { BrewMethodSlug, CreateBrewInput } from '@crema/shared';

/**
 * The demo brews, mirrored from `supabase/seed.sql`.
 *
 * v1 runs on the in-memory adapter, so this file is what a freshly started app
 * actually contains — the same rows a seeded Postgres would hold, which is what
 * makes the two adapters comparable by eye as well as by test.
 *
 * The first three are the brews drawn in the assessment wireframes, so a
 * running app can be held up against the design directly. The V60 ladder after
 * them exists so the Phase 6 coach has real history to answer "what ratio gives
 * me my best V60s" from.
 *
 * Two hand-maintained copies of the same data can drift, so `seed-brews.test.ts`
 * reads the SQL and compares. Same discipline as the brew method vocabulary.
 */

export interface SeedBrew extends Omit<CreateBrewInput, 'brewedAt'> {
  /** Brewed this many days before the app started, matching `now() - n * interval '1 day'`. */
  daysAgo: number;
}

const seed = (
  beans: string,
  method: BrewMethodSlug,
  coffeeGrams: number,
  waterGrams: number,
  rating: number,
  tastingNotes: string,
  daysAgo: number,
): SeedBrew => ({ beans, method, coffeeGrams, waterGrams, rating, tastingNotes, daysAgo });

/*
 * Laid out as a table, aligned to match the `values` block in seed.sql column
 * for column. Reading the two side by side should be possible by eye, which is
 * worth more here than Prettier's default wrapping — hence the escape hatch.
 */
// prettier-ignore
export const SEED_BREWS: readonly SeedBrew[] = [
  // The three brews from the wireframes.
  seed('Zimbabwean highlands',  'aeropress',    15.0, 200.0, 3, 'Heavy body, soft finish, nutty',                    1),
  seed('Nigerian dark roast',   'drip',         10.0, 120.0, 5, 'Rich and syrupy, dark chocolate, low acidity',      2),
  seed('Italian decaf',         'v60',          20.0, 180.0, 1, 'Flat and papery, over-extracted, quite bitter',     3),

  // A V60 ratio ladder. The good ones cluster around 1:16.
  seed('Ethiopian Yirgacheffe', 'v60',          18.0, 288.0, 5, 'Blackcurrant, jasmine, tea-like and clean',         4),
  seed('Ethiopian Yirgacheffe', 'v60',          18.0, 234.0, 2, 'Muddy and heavy, lost the florals entirely',        6),
  seed('Ethiopian Yirgacheffe', 'v60',          18.0, 306.0, 4, 'Delicate, a little thin, still very pleasant',      8),
  seed('Kenyan AA',             'v60',          17.0, 272.0, 5, 'Grapefruit, blackberry, bright and juicy',         10),

  // Other methods, for comparison.
  seed('Colombian Huila',       'french-press', 30.0, 450.0, 4, 'Caramel and almond, heavy body, gentle finish',    12),
  seed('Brazilian Santos',      'espresso',     18.0,  36.0, 4, 'Hazelnut and cocoa, thick crema, low acidity',     13),
  seed('Guatemalan Antigua',    'chemex',       22.0, 352.0, 5, 'Milk chocolate, orange peel, exceptionally clean', 15),
  seed('Sumatran Mandheling',   'moka-pot',     16.0, 160.0, 2, 'Earthy and a bit harsh, scorched on the stove',    18),
  seed('Costa Rican Tarrazu',   'cold-brew',    80.0, 800.0, 4, 'Smooth, sweet, mellow — no bitterness at all',     21),
];

/**
 * The fixture as repository input, dated relative to when the app started.
 *
 * Relative rather than fixed dates because "3 days ago" stays true and a
 * hardcoded 2026 date becomes visibly stale demo data by the second week.
 */
export function seedBrewInputs(now: Date = new Date()): CreateBrewInput[] {
  return SEED_BREWS.map(({ daysAgo, ...brew }) => ({
    ...brew,
    brewedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  }));
}
