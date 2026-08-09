import { describe, expect, it } from 'vitest';
import { describeAiProviderContract } from './ai-provider.contract.js';
import { FakeAiProvider } from './fake-ai-provider.js';

describeAiProviderContract('FakeAiProvider', {
  fresh: () => Promise.resolve(new FakeAiProvider()),
});

/**
 * Everything the contract cannot ask of a real model, but this one promises.
 *
 * Repeatability is the whole reason the fake exists, so it is asserted here
 * rather than left as a property people assume. The rest covers the phrasings
 * the reader is documented as understanding — if one of these regresses, the
 * suites that depend on the fake start failing for reasons that have nothing to
 * do with what they are testing.
 */
describe('FakeAiProvider', () => {
  const provider = new FakeAiProvider();

  it('gives the same answer every time', async () => {
    const sentence = '18g Ethiopian through the V60, 300 water, blackcurrant, solid 4';

    const [first, second] = await Promise.all([
      provider.proposeBrew(sentence),
      provider.proposeBrew(sentence),
    ]);

    expect(first).toEqual(second);
  });

  describe('amounts', () => {
    it.each([
      ['18g coffee, 300 water', 18, 300],
      ['18 grams, water: 290', 18, 290],
      ['Used 22g and 352g of water', 22, 352],
      ['15g dose with 250ml water', 15, 250],
    ])('reads %s', async (text, coffeeGrams, waterGrams) => {
      const { proposal } = await provider.proposeBrew(text);

      expect(proposal.brew.coffeeGrams).toBe(coffeeGrams);
      expect(proposal.brew.waterGrams).toBe(waterGrams);
    });

    it('leaves the dose alone when no unit was given', async () => {
      // A bare number is more often a rating than a dose, and guessing wrong
      // here quietly corrupts the log the coach later reasons over.
      const { proposal } = await provider.proposeBrew('18 through the V60, 300 water');

      expect(proposal.brew.coffeeGrams).toBeUndefined();
    });
  });

  describe('method', () => {
    it.each([
      ['through the V60', 'v60'],
      ['in the aeropress', 'aeropress'],
      ['french press this morning', 'french-press'],
      ['french-press this morning', 'french-press'],
      ['a cold brew overnight', 'cold-brew'],
      ['moka pot on the hob', 'moka-pot'],
    ])('reads "%s" as %s', async (text, slug) => {
      const { proposal } = await provider.proposeBrew(text);

      expect(proposal.brew.method).toBe(slug);
    });

    it('marks a method it guessed rather than read', async () => {
      const { proposal } = await provider.proposeBrew('a pour over, 18g, 300 water');

      expect(proposal.brew.method).toBe('v60');
      expect(proposal.inferred).toContain('method');
    });

    it('does not mark a method the sentence named outright', async () => {
      const { proposal } = await provider.proposeBrew('V60, 18g, 300 water');

      expect(proposal.inferred).not.toContain('method');
    });
  });

  describe('rating', () => {
    it.each([
      ['4/5', 4],
      ['5 stars', 5],
      ['solid 4', 4],
      ['rated 3', 3],
      ['call it a 2', 2],
      ['1 out of 5', 1],
    ])('reads "%s" as %s', async (text, rating) => {
      const { proposal } = await provider.proposeBrew(text);

      expect(proposal.brew.rating).toBe(rating);
    });

    it('ignores a number that is not a rating', async () => {
      const { proposal } = await provider.proposeBrew('brewed at 93 degrees');

      expect(proposal.brew.rating).toBeUndefined();
    });
  });

  describe('tasting notes', () => {
    it('reads the clause after a cue and stops at the rating', async () => {
      const { proposal } = await provider.proposeBrew(
        '18g V60, 300 water, tasted like blackcurrant and tea, solid 4',
      );

      expect(proposal.brew.tastingNotes).toBe('blackcurrant and tea');
      expect(proposal.brew.rating).toBe(4);
    });

    it('reads notes introduced by a label', async () => {
      const { proposal } = await provider.proposeBrew('V60. Notes: stone fruit, honey, clean');

      expect(proposal.brew.tastingNotes).toBe('stone fruit, honey, clean');
    });
  });

  describe('beans', () => {
    it('reads a labelled name outright', async () => {
      const { proposal } = await provider.proposeBrew('Beans: Kenyan AA, 18g, 300 water');

      expect(proposal.brew.beans).toBe('Kenyan AA');
      expect(proposal.inferred).not.toContain('beans');
    });

    it('marks a name it guessed from capitalisation', async () => {
      const { proposal } = await provider.proposeBrew('18g of the Ethiopian through the V60');

      expect(proposal.brew.beans).toBe('Ethiopian');
      expect(proposal.inferred).toContain('beans');
    });
  });

  describe('brewed at', () => {
    it('reads a timestamp the sentence contains', async () => {
      const { proposal } = await provider.proposeBrew('V60 at 2026-08-09T07:30:00.000Z, 18g');

      expect(proposal.brew.brewedAt).toBe('2026-08-09T07:30:00.000Z');
    });

    it('does not invent one from a relative phrase', async () => {
      // Resolving "yesterday" needs a clock, and a fake that reads the clock
      // stops being repeatable. The real provider is welcome to do better.
      const { proposal } = await provider.proposeBrew('V60 yesterday morning, 18g');

      expect(proposal.brew.brewedAt).toBeUndefined();
    });
  });

  it('estimates usage from the length of what it was given', async () => {
    const { usage } = await provider.proposeBrew('18g V60');

    expect(usage.inputTokens).toBe(2);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });
});
