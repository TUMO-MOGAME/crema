import { z } from 'zod';

/**
 * The flavour vocabulary, mirrored from `0004_flavor_tags.sql`.
 *
 * The migration seeds these rows and is the schema of record; this constant
 * exists so both sides can name a tag without a round trip, exactly as
 * `BREW_METHODS` does for methods. A sync test on the backend reads the
 * migration and asserts the two lists cannot drift.
 *
 * The vocabulary is the SCA flavour wheel's top-level categories — a language
 * specialty roasters already speak rather than one invented here.
 */
export const FLAVOR_TAGS = [
  { slug: 'fruity', label: 'Fruity' },
  { slug: 'floral', label: 'Floral' },
  { slug: 'citrus', label: 'Citrus' },
  { slug: 'berry', label: 'Berry' },
  { slug: 'chocolate', label: 'Chocolate' },
  { slug: 'caramel', label: 'Caramel' },
  { slug: 'nutty', label: 'Nutty' },
  { slug: 'spice', label: 'Spice' },
  { slug: 'roasted', label: 'Roasted' },
  { slug: 'earthy', label: 'Earthy' },
  { slug: 'sweet', label: 'Sweet' },
  { slug: 'acidic', label: 'Acidic' },
  { slug: 'bitter', label: 'Bitter' },
  { slug: 'smooth', label: 'Smooth' },
] as const;

export const FLAVOR_TAG_SLUGS = FLAVOR_TAGS.map((tag) => tag.slug);

export type FlavorTagSlug = (typeof FLAVOR_TAGS)[number]['slug'];

export const flavorTagSlugSchema = z.enum(FLAVOR_TAG_SLUGS as [FlavorTagSlug, ...FlavorTagSlug[]]);

/**
 * One tag on one brew, as the API serves it.
 *
 * `source` is the column the whole design leans on: an AI-derived tag must
 * never be indistinguishable from one a person chose, because the reader needs
 * to know what to trust and what to fix. `confidence` exists only for the AI —
 * a person either chose the tag or did not.
 */
export const brewFlavorTagSchema = z
  .object({
    slug: flavorTagSlugSchema,
    label: z.string(),
    source: z.enum(['human', 'ai']),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .superRefine((tag, ctx) => {
    if (tag.source === 'human' && tag.confidence !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['confidence'],
        message: 'A human either chose the tag or did not; confidence is for the model.',
      });
    }
  });

export type BrewFlavorTag = z.infer<typeof brewFlavorTagSchema>;

/** `POST /api/ai/flavor-tags` body: which brew to read the notes of. */
export const extractFlavorTagsRequestSchema = z.object({ brewId: z.string().uuid() }).strict();

export type ExtractFlavorTagsRequest = z.infer<typeof extractFlavorTagsRequestSchema>;

export const brewFlavorTagListSchema = z.array(brewFlavorTagSchema);

/** For narrowing a slug read back from storage, where citext says `string`. */
export function isFlavorTagSlug(value: string): value is FlavorTagSlug {
  return (FLAVOR_TAG_SLUGS as readonly string[]).includes(value);
}

/** The display label for a slug, from the same vocabulary the table seeds. */
export function flavorTagLabel(slug: FlavorTagSlug): string {
  const found = FLAVOR_TAGS.find((tag) => tag.slug === slug);

  // Unreachable while the parameter is typed, kept for the same reason the
  // method lookup keeps one: a slug from a cast would otherwise render blank.
  return found?.label ?? slug;
}

/** Vocabulary position, for sorting tags the way the wheel lists them. */
export function flavorTagOrder(slug: FlavorTagSlug): number {
  return FLAVOR_TAG_SLUGS.indexOf(slug);
}
