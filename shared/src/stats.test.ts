import { describe, expect, it } from 'vitest';
import { brewMethodStatsSchema, brewStatsSchema, EMPTY_BREW_STATS } from './stats';

const methodStats = {
  method: 'v60',
  label: 'V60',
  brewCount: 4,
  averageRating: 4.25,
  averageRatio: 15.8,
  minRatio: 13,
  maxRatio: 17,
  lastBrewedAt: '2026-08-06T10:00:00.000Z',
};

const stats = {
  brewCount: 12,
  averageRating: 3.67,
  averageRatio: 14.2,
  methodsUsed: 8,
  firstBrewedAt: '2026-07-16T10:00:00.000Z',
  lastBrewedAt: '2026-08-06T10:00:00.000Z',
  byMethod: [methodStats],
};

describe('brewStatsSchema', () => {
  it('accepts a populated log', () => {
    expect(brewStatsSchema.safeParse(stats).success).toBe(true);
  });

  it('accepts an empty log, where there is nothing to average', () => {
    expect(brewStatsSchema.safeParse(EMPTY_BREW_STATS).success).toBe(true);
  });

  it('refuses a negative count, which no aggregate can produce', () => {
    expect(brewStatsSchema.safeParse({ ...stats, brewCount: -1 }).success).toBe(false);
  });

  it('refuses a fractional count', () => {
    expect(brewStatsSchema.safeParse({ ...stats, brewCount: 1.5 }).success).toBe(false);
  });

  it('refuses a timestamp without an offset, so the client never guesses a zone', () => {
    expect(brewStatsSchema.safeParse({ ...stats, lastBrewedAt: '2026-08-06' }).success).toBe(false);
  });

  it('requires the breakdown, even when it is empty', () => {
    const { byMethod: _byMethod, ...withoutBreakdown } = stats;

    expect(brewStatsSchema.safeParse(withoutBreakdown).success).toBe(false);
  });
});

describe('brewMethodStatsSchema', () => {
  it('accepts a method with brews', () => {
    expect(brewMethodStatsSchema.safeParse(methodStats).success).toBe(true);
  });

  it('refuses a count of zero — a method with no brews is left out, not listed', () => {
    expect(brewMethodStatsSchema.safeParse({ ...methodStats, brewCount: 0 }).success).toBe(false);
  });

  it('refuses a method outside the vocabulary', () => {
    expect(brewMethodStatsSchema.safeParse({ ...methodStats, method: 'cafetiere' }).success).toBe(
      false,
    );
  });

  it('refuses a null average, because a listed method always has one', () => {
    expect(brewMethodStatsSchema.safeParse({ ...methodStats, averageRating: null }).success).toBe(
      false,
    );
  });
});

describe('EMPTY_BREW_STATS', () => {
  it('is the zero state a client can render without special-casing', () => {
    expect(EMPTY_BREW_STATS.brewCount).toBe(0);
    expect(EMPTY_BREW_STATS.averageRating).toBeNull();
    expect(EMPTY_BREW_STATS.byMethod).toEqual([]);
  });
});
