/**
 * The controlled vocabulary of brew methods.
 *
 * This list is the single source of truth. The `brew_methods` lookup table
 * seeded in `supabase/migrations/0002_brew_methods.sql` mirrors it exactly, and
 * a test in Phase 2 asserts the two never drift apart.
 */

export const BREW_METHOD_SLUGS = [
  'v60',
  'aeropress',
  'drip',
  'french-press',
  'chemex',
  'espresso',
  'moka-pot',
  'cold-brew',
] as const;

export type BrewMethodSlug = (typeof BREW_METHOD_SLUGS)[number];

const LABELS: Record<BrewMethodSlug, string> = {
  v60: 'V60',
  aeropress: 'Aeropress',
  drip: 'Drip coffee',
  'french-press': 'French press',
  chemex: 'Chemex',
  espresso: 'Espresso',
  'moka-pot': 'Moka pot',
  'cold-brew': 'Cold brew',
};

export interface BrewMethod {
  readonly slug: BrewMethodSlug;
  readonly label: string;
}

/** Ordered for display in the filter dropdown and the method select. */
export const BREW_METHODS: readonly BrewMethod[] = BREW_METHOD_SLUGS.map((slug) => ({
  slug,
  label: LABELS[slug],
}));

export function brewMethodLabel(slug: BrewMethodSlug): string {
  return LABELS[slug];
}

export function isBrewMethodSlug(value: unknown): value is BrewMethodSlug {
  return typeof value === 'string' && (BREW_METHOD_SLUGS as readonly string[]).includes(value);
}
