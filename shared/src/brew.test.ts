import { describe, expect, it } from 'vitest';
import {
  BREW_LIMITS,
  brewRatio,
  createBrewSchema,
  formatBrewRatio,
  updateBrewSchema,
} from './brew.js';
import {
  BREW_METHODS,
  BREW_METHOD_SLUGS,
  brewMethodLabel,
  isBrewMethodSlug,
} from './brew-methods.js';

const validBrew = {
  beans: 'Zimbabwean highlands',
  method: 'aeropress',
  coffeeGrams: 15,
  waterGrams: 200,
  rating: 3,
  tastingNotes: 'Heavy body, soft finish, nutty',
};

describe('createBrewSchema', () => {
  it('accepts a complete brew', () => {
    expect(createBrewSchema.safeParse(validBrew).success).toBe(true);
  });

  it.each(['beans', 'tastingNotes'] as const)('rejects a blank %s', (field) => {
    const result = createBrewSchema.safeParse({ ...validBrew, [field]: '   ' });
    expect(result.success).toBe(false);
  });

  it.each(['beans', 'method', 'coffeeGrams', 'waterGrams', 'rating', 'tastingNotes'] as const)(
    'rejects a missing %s',
    (field) => {
      const { [field]: _omitted, ...incomplete } = validBrew;
      expect(createBrewSchema.safeParse(incomplete).success).toBe(false);
    },
  );

  it('trims surrounding whitespace rather than storing it', () => {
    const result = createBrewSchema.safeParse({ ...validBrew, beans: '  Ethiopian  ' });
    expect(result.success && result.data.beans).toBe('Ethiopian');
  });

  it('rejects an unknown brew method', () => {
    expect(createBrewSchema.safeParse({ ...validBrew, method: 'percolator' }).success).toBe(false);
  });

  it('rejects a non-positive coffee dose', () => {
    expect(createBrewSchema.safeParse({ ...validBrew, coffeeGrams: 0 }).success).toBe(false);
  });

  it.each([0, 6, 3.5])('rejects an out-of-range or fractional rating of %s', (rating) => {
    expect(createBrewSchema.safeParse({ ...validBrew, rating }).success).toBe(false);
  });

  it('rejects unknown fields rather than silently dropping them', () => {
    expect(createBrewSchema.safeParse({ ...validBrew, isAdmin: true }).success).toBe(false);
  });

  it('does not accept server-owned fields from the client', () => {
    const result = createBrewSchema.safeParse({
      ...validBrew,
      id: '5f9d1c3e-2b4a-4c8d-9e1f-7a6b5c4d3e2f',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBrewSchema', () => {
  it('accepts a single field', () => {
    expect(updateBrewSchema.safeParse({ rating: 5 }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(updateBrewSchema.safeParse({}).success).toBe(false);
  });

  it('still validates the fields it is given', () => {
    expect(updateBrewSchema.safeParse({ rating: 9 }).success).toBe(false);
  });
});

describe('brewRatio', () => {
  it('expresses water against coffee to one decimal place', () => {
    expect(brewRatio(15, 200)).toBe(13.3);
    expect(brewRatio(20, 320)).toBe(16);
  });

  it('formats the way a ratio is written on a bag', () => {
    expect(formatBrewRatio(18, 300)).toBe('1:16.7');
  });

  it('does not divide by zero', () => {
    expect(brewRatio(0, 200)).toBe(0);
  });
});

describe('brew methods', () => {
  it('exposes a label for every slug', () => {
    expect(BREW_METHODS).toHaveLength(BREW_METHOD_SLUGS.length);
    for (const slug of BREW_METHOD_SLUGS) {
      expect(brewMethodLabel(slug)).toBeTruthy();
    }
  });

  it('covers the methods shown in the wireframes', () => {
    expect(BREW_METHOD_SLUGS).toEqual(expect.arrayContaining(['v60', 'aeropress', 'drip']));
  });

  it('narrows unknown values', () => {
    expect(isBrewMethodSlug('v60')).toBe(true);
    expect(isBrewMethodSlug('percolator')).toBe(false);
    expect(isBrewMethodSlug(null)).toBe(false);
  });

  it('keeps limits internally consistent', () => {
    expect(BREW_LIMITS.ratingMin).toBeLessThan(BREW_LIMITS.ratingMax);
    expect(BREW_LIMITS.coffeeGramsMin).toBeLessThan(BREW_LIMITS.coffeeGramsMax);
  });
});
