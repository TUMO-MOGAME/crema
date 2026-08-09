import { describe, expect, it } from 'vitest';
import {
  AI_LIMITS,
  BREW_FIELDS,
  brewProposalSchema,
  EMPTY_BREW_PROPOSAL,
  quickLogRequestSchema,
} from './ai';

describe('quickLogRequestSchema', () => {
  it('accepts a sentence describing a brew', () => {
    const result = quickLogRequestSchema.parse({
      text: '18g Ethiopian through the V60, 300 water, blackcurrant, solid 4',
    });

    expect(result.text).toContain('Ethiopian');
  });

  it('trims before measuring, so whitespace is not a description', () => {
    expect(() => quickLogRequestSchema.parse({ text: '   ' })).toThrow(
      /Describe the brew in a sentence/,
    );
  });

  it('refuses text beyond the cap', () => {
    const tooLong = 'a'.repeat(AI_LIMITS.quickLogMaxLength + 1);

    expect(() => quickLogRequestSchema.parse({ text: tooLong })).toThrow(/Keep it under/);
  });

  it('accepts text exactly at the cap', () => {
    const atLimit = 'a'.repeat(AI_LIMITS.quickLogMaxLength);

    expect(quickLogRequestSchema.parse({ text: atLimit }).text).toHaveLength(
      AI_LIMITS.quickLogMaxLength,
    );
  });

  it('rejects unknown keys rather than ignoring them', () => {
    expect(() => quickLogRequestSchema.parse({ text: 'a V60', model: 'gpt' })).toThrow();
  });
});

describe('brewProposalSchema', () => {
  it('accepts a proposal that determined nothing', () => {
    expect(() => brewProposalSchema.parse(EMPTY_BREW_PROPOSAL)).not.toThrow();
  });

  it('accepts a partial brew, because a sentence may not mention everything', () => {
    const proposal = brewProposalSchema.parse({
      brew: { method: 'v60', coffeeGrams: 18 },
      inferred: [],
    });

    expect(proposal.brew).toEqual({ method: 'v60', coffeeGrams: 18 });
  });

  it('applies the same field rules the API enforces', () => {
    // 900 grams of coffee is outside BREW_LIMITS, and a proposal is not a
    // loophole around the contract just because a model produced it.
    expect(() => brewProposalSchema.parse({ brew: { coffeeGrams: 900 }, inferred: [] })).toThrow();
  });

  it('rejects a field marked inferred that was never proposed', () => {
    expect(() =>
      brewProposalSchema.parse({ brew: { method: 'v60' }, inferred: ['rating'] }),
    ).toThrow(/listed as inferred but is not part of the proposal/);
  });

  it('accepts a field marked inferred when it was proposed', () => {
    expect(() =>
      brewProposalSchema.parse({ brew: { rating: 4 }, inferred: ['rating'] }),
    ).not.toThrow();
  });

  it('rejects the same field listed as inferred twice', () => {
    expect(() =>
      brewProposalSchema.parse({ brew: { rating: 4 }, inferred: ['rating', 'rating'] }),
    ).toThrow(/only be listed as inferred once/);
  });

  it('rejects an unknown field name in inferred', () => {
    expect(() => brewProposalSchema.parse({ brew: {}, inferred: ['grindSize'] })).toThrow();
  });

  it('rejects unknown keys on the proposal itself', () => {
    expect(() => brewProposalSchema.parse({ brew: {}, inferred: [], confidence: 0.9 })).toThrow();
  });
});

describe('BREW_FIELDS', () => {
  it('names every field a brew can be created with', () => {
    // The `satisfies` clause in the source proves each name is a real key of
    // the create contract. This proves the reverse — that none has been
    // forgotten — so adding a brew field forces a decision here.
    expect([...BREW_FIELDS].sort()).toEqual(
      ['beans', 'brewedAt', 'coffeeGrams', 'method', 'rating', 'tastingNotes', 'waterGrams'].sort(),
    );
  });
});
