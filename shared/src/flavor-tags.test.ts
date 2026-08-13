import { describe, expect, it } from 'vitest';
import {
  brewFlavorTagSchema,
  extractFlavorTagsRequestSchema,
  FLAVOR_TAGS,
  flavorTagLabel,
  flavorTagOrder,
  FLAVOR_TAG_SLUGS,
  isFlavorTagSlug,
} from './flavor-tags.js';

describe('brewFlavorTagSchema', () => {
  it('accepts an AI tag carrying its confidence', () => {
    expect(() =>
      brewFlavorTagSchema.parse({ slug: 'berry', label: 'Berry', source: 'ai', confidence: 0.9 }),
    ).not.toThrow();
  });

  it('accepts a human tag with no confidence, because the question does not arise', () => {
    expect(() =>
      brewFlavorTagSchema.parse({
        slug: 'chocolate',
        label: 'Chocolate',
        source: 'human',
        confidence: null,
      }),
    ).not.toThrow();
  });

  it('refuses a human tag claiming a confidence', () => {
    // The database CHECK says the same thing; the schema says it earlier and
    // with a message.
    expect(
      () =>
      brewFlavorTagSchema.parse({ slug: 'sweet', label: 'Sweet', source: 'human', confidence: 0.5 }), // prettier-ignore
    ).toThrow(/confidence is for the model/);
  });

  it('refuses a confidence outside the unit interval', () => {
    expect(() =>
      brewFlavorTagSchema.parse({ slug: 'sweet', label: 'Sweet', source: 'ai', confidence: 1.2 }),
    ).toThrow();
  });

  it('refuses a tag outside the vocabulary', () => {
    expect(() =>
      brewFlavorTagSchema.parse({ slug: 'umami', label: 'Umami', source: 'ai', confidence: 0.9 }),
    ).toThrow();
  });
});

describe('the vocabulary helpers', () => {
  it('recognises every slug and nothing else', () => {
    for (const slug of FLAVOR_TAG_SLUGS) expect(isFlavorTagSlug(slug)).toBe(true);
    expect(isFlavorTagSlug('umami')).toBe(false);
  });

  it('labels every slug the way the vocabulary spells it', () => {
    for (const tag of FLAVOR_TAGS) expect(flavorTagLabel(tag.slug)).toBe(tag.label);
  });

  it('orders slugs the way the vocabulary lists them', () => {
    expect(flavorTagOrder('fruity')).toBe(0);
    expect(flavorTagOrder('smooth')).toBe(FLAVOR_TAGS.length - 1);
    expect(flavorTagOrder('berry')).toBeLessThan(flavorTagOrder('chocolate'));
  });
});

describe('extractFlavorTagsRequestSchema', () => {
  it('accepts a brew id and nothing else', () => {
    const id = '11111111-1111-4111-8111-000000000001';

    expect(() => extractFlavorTagsRequestSchema.parse({ brewId: id })).not.toThrow();
    expect(() => extractFlavorTagsRequestSchema.parse({ brewId: 'not-a-uuid' })).toThrow();
    expect(() => extractFlavorTagsRequestSchema.parse({ brewId: id, notes: 'x' })).toThrow();
  });
});
