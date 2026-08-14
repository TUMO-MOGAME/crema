import { BREW_PAGE, type CreateBrewInput } from '@crema/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryBrewRepository } from '../repositories/in-memory-brew.repository.js';
import { createCoachTools } from './coach-tools.js';

/**
 * The tool summaries, at the one boundary the contract suite cannot reach: a
 * log bigger than the page the tools read. The trace panel shows these lines
 * as the agent's account of what it looked at, so the account has to say when
 * it looked at a slice.
 */

function brewsNumbering(count: number): CreateBrewInput[] {
  return Array.from({ length: count }, (_, index) => ({
    beans: `Bean ${index + 1}`,
    method: 'v60' as const,
    coffeeGrams: 18,
    waterGrams: 300,
    rating: 4,
    tastingNotes: 'Fine',
  }));
}

describe('coach tool summaries', () => {
  it('describes a log that fits in one page as simply read', async () => {
    const tools = createCoachTools(new InMemoryBrewRepository(brewsNumbering(3)));

    const result = await tools.listBrews({});

    expect(result.summary).toContain('Read 3 of 3 matching brews');
    expect(result.summary).not.toContain('Searched the newest');
  });

  it('says when the log outgrew the page it read', async () => {
    const total = BREW_PAGE.maxLimit + 5;
    const tools = createCoachTools(new InMemoryBrewRepository(brewsNumbering(total)));

    const result = await tools.listBrews({});

    // Without this sentence the model reasons, and the trace claims, over a
    // slice neither knows is one.
    expect(result.summary).toContain(
      `Searched the newest ${BREW_PAGE.maxLimit} of ${total} logged brews.`,
    );
  });

  it('says it when searching for similar brews, too', async () => {
    const total = BREW_PAGE.maxLimit + 1;
    const tools = createCoachTools(new InMemoryBrewRepository(brewsNumbering(total)));

    const result = await tools.findSimilarBrews({ beans: 'Bean' });

    expect(result.summary).toContain(
      `Searched the newest ${BREW_PAGE.maxLimit} of ${total} logged brews.`,
    );
  });
});
