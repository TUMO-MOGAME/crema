import { brewSchema, brewStatsSchema, EMPTY_BREW_STATS, type CreateBrewInput } from '@crema/shared';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BrewRepository } from './brew.repository.js';

/**
 * The suite every `BrewRepository` implementation must pass.
 *
 * This file is the actual value of the repository pattern here. Without it,
 * "two interchangeable adapters" is a diagram; with it, the in-memory adapter
 * that ships in v1 and the Drizzle adapter that ships dormant are held to one
 * definition of correct, and the day `DATA_SOURCE` flips to `postgres` is a
 * configuration change instead of a bug hunt.
 *
 * It is deliberately written against behaviour a caller can observe, never
 * against how either adapter stores anything. Soft delete is a good example:
 * the contract says a deleted brew stops being visible and a second delete
 * reports nothing to do. Whether that is `deleted_at = now()` or a flag on a
 * `Map` entry is not the contract's business.
 *
 * Not a `.test.ts` file on purpose — it exports a suite rather than being one,
 * and each adapter's own test file calls it.
 */

export interface BrewRepositoryHarness {
  /** A repository containing no brews. Called before every test. */
  fresh: () => Promise<BrewRepository>;
}

/** Valid input, so each test can vary the one field it is about. */
function aBrew(overrides: Partial<CreateBrewInput> = {}): CreateBrewInput {
  return {
    beans: 'Ethiopian Yirgacheffe',
    method: 'v60',
    coffeeGrams: 18,
    waterGrams: 288,
    rating: 5,
    tastingNotes: 'Blackcurrant, jasmine, tea-like and clean',
    ...overrides,
  };
}

/** Days before now, as the ISO string the API accepts. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function describeBrewRepositoryContract(
  adapterName: string,
  harness: BrewRepositoryHarness,
): void {
  describe(`${adapterName} — BrewRepository contract`, () => {
    let repository: BrewRepository;

    beforeEach(async () => {
      repository = await harness.fresh();
    });

    describe('create', () => {
      it('returns a brew the shared contract accepts', async () => {
        const brew = await repository.create(aBrew());

        // The strongest single assertion in the suite: whatever the adapter
        // holds, what comes back out is exactly what the API promises and the
        // frontend infers its types from.
        expect(() => brewSchema.parse(brew)).not.toThrow();
      });

      it('assigns an id the caller did not choose', async () => {
        const first = await repository.create(aBrew());
        const second = await repository.create(aBrew());

        expect(first.id).not.toBe(second.id);
        expect(first.id).toMatch(/^[0-9a-f-]{36}$/i);
      });

      it('keeps every field it was given', async () => {
        const input = aBrew({
          beans: 'Kenyan AA',
          method: 'chemex',
          coffeeGrams: 22,
          waterGrams: 352,
          rating: 4,
          tastingNotes: 'Grapefruit, blackberry, bright and juicy',
        });

        const brew = await repository.create(input);

        expect(brew).toMatchObject(input);
      });

      it('defaults the brew date to now when none is given', async () => {
        const brew = await repository.create(aBrew());

        // Generous window: the in-memory adapter reads this process's clock and
        // Postgres reads its own, and in CI those are different containers.
        expect(Date.now() - Date.parse(brew.brewedAt)).toBeLessThan(60_000);
      });

      it('keeps a brew date that is in the past, so yesterday can be logged today', async () => {
        const brewedAt = daysAgo(3);

        const brew = await repository.create(aBrew({ brewedAt }));

        expect(brew.brewedAt).toBe(brewedAt);
      });

      it('stores the instant, not the offset it arrived in', async () => {
        const brew = await repository.create(aBrew({ brewedAt: '2026-08-06T12:00:00+02:00' }));

        expect(brew.brewedAt).toBe('2026-08-06T10:00:00.000Z');
      });

      it('rounds grams to two decimals, the way the numeric columns do', async () => {
        const brew = await repository.create(aBrew({ coffeeGrams: 18.567, waterGrams: 288.234 }));

        expect(brew.coffeeGrams).toBe(18.57);
        expect(brew.waterGrams).toBe(288.23);
      });

      it('creates a brew that has never been updated', async () => {
        const brew = await repository.create(aBrew());

        expect(Date.parse(brew.updatedAt)).toBe(Date.parse(brew.createdAt));
      });
    });

    describe('findById', () => {
      it('returns the brew that was created', async () => {
        const created = await repository.create(aBrew());

        await expect(repository.findById(created.id)).resolves.toEqual(created);
      });

      it('returns null for an id nothing was ever stored under', async () => {
        await expect(repository.findById(randomUUID())).resolves.toBeNull();
      });

      it('returns null for a deleted brew', async () => {
        const created = await repository.create(aBrew());
        await repository.softDelete(created.id);

        await expect(repository.findById(created.id)).resolves.toBeNull();
      });
    });

    describe('list', () => {
      it('is empty before anything is logged', async () => {
        const page = await repository.list();

        expect(page.brews).toEqual([]);
        expect(page.total).toBe(0);
      });

      it('returns every live brew', async () => {
        await repository.create(aBrew({ brewedAt: daysAgo(1) }));
        await repository.create(aBrew({ brewedAt: daysAgo(2) }));

        const page = await repository.list();

        expect(page.brews).toHaveLength(2);
        expect(page.total).toBe(2);
      });

      it('returns the most recent brew first', async () => {
        const older = await repository.create(aBrew({ beans: 'Older', brewedAt: daysAgo(9) }));
        const newest = await repository.create(aBrew({ beans: 'Newest', brewedAt: daysAgo(1) }));
        const middle = await repository.create(aBrew({ beans: 'Middle', brewedAt: daysAgo(4) }));

        const { brews } = await repository.list();

        // Insertion order is deliberately not brew order: the list view sorts
        // by when the coffee was made, not by when it was typed in.
        expect(brews.map((brew) => brew.id)).toEqual([newest.id, middle.id, older.id]);
      });

      it('filters to one method', async () => {
        const v60 = await repository.create(aBrew({ method: 'v60' }));
        await repository.create(aBrew({ method: 'espresso' }));
        await repository.create(aBrew({ method: 'chemex' }));

        const page = await repository.list({ method: 'v60' });

        expect(page.brews).toHaveLength(1);
        expect(page.brews[0]?.id).toBe(v60.id);
        // The total describes the filter, not the whole log.
        expect(page.total).toBe(1);
      });

      it('returns nothing for a method with no brews, rather than everything', async () => {
        await repository.create(aBrew({ method: 'v60' }));

        const page = await repository.list({ method: 'cold-brew' });

        expect(page.brews).toEqual([]);
        expect(page.total).toBe(0);
      });

      it('leaves out deleted brews', async () => {
        const kept = await repository.create(aBrew({ beans: 'Kept' }));
        const removed = await repository.create(aBrew({ beans: 'Removed' }));

        await repository.softDelete(removed.id);
        const page = await repository.list();

        expect(page.brews.map((brew) => brew.id)).toEqual([kept.id]);
        expect(page.total).toBe(1);
      });

      it('leaves out deleted brews when filtering too', async () => {
        const removed = await repository.create(aBrew({ method: 'aeropress' }));
        await repository.softDelete(removed.id);

        const page = await repository.list({ method: 'aeropress' });

        expect(page.brews).toEqual([]);
        expect(page.total).toBe(0);
      });
    });

    /**
     * Paging is where two adapters most easily drift, because one slices an
     * array and the other writes LIMIT/OFFSET — and an off-by-one in either is
     * invisible until a brew goes missing between page one and page two.
     */
    describe('list paging', () => {
      /** Distinct brew dates, so the order under paging is never a tiebreak. */
      async function threeBrews() {
        const oldest = await repository.create(aBrew({ beans: 'Oldest', brewedAt: daysAgo(3) }));
        const middle = await repository.create(aBrew({ beans: 'Middle', brewedAt: daysAgo(2) }));
        const newest = await repository.create(aBrew({ beans: 'Newest', brewedAt: daysAgo(1) }));

        return { oldest, middle, newest };
      }

      it('returns only as many brews as the limit allows', async () => {
        const { newest } = await threeBrews();

        const page = await repository.list({ limit: 1 });

        expect(page.brews.map((brew) => brew.id)).toEqual([newest.id]);
        expect(page.limit).toBe(1);
        expect(page.offset).toBe(0);
      });

      it('reports the total that matched, not the size of the page', async () => {
        await threeBrews();

        const page = await repository.list({ limit: 1 });

        expect(page.brews).toHaveLength(1);
        expect(page.total).toBe(3);
      });

      it('skips the offset and keeps the order', async () => {
        const { middle, oldest } = await threeBrews();

        const page = await repository.list({ limit: 2, offset: 1 });

        expect(page.brews.map((brew) => brew.id)).toEqual([middle.id, oldest.id]);
        expect(page.offset).toBe(1);
      });

      it('walks the whole log exactly once across consecutive pages', async () => {
        const { newest, middle, oldest } = await threeBrews();

        const first = await repository.list({ limit: 2, offset: 0 });
        const second = await repository.list({ limit: 2, offset: 2 });

        // No brew appears twice, and none is skipped between the pages.
        expect([...first.brews, ...second.brews].map((brew) => brew.id)).toEqual([
          newest.id,
          middle.id,
          oldest.id,
        ]);
      });

      it('answers an offset past the end with an empty page and an honest total', async () => {
        await threeBrews();

        const page = await repository.list({ offset: 99 });

        expect(page.brews).toEqual([]);
        // The brews exist; this page just does not contain any of them.
        expect(page.total).toBe(3);
      });

      it('pages within a method filter rather than across the whole log', async () => {
        await repository.create(aBrew({ method: 'v60', brewedAt: daysAgo(1) }));
        await repository.create(aBrew({ method: 'v60', brewedAt: daysAgo(2) }));
        await repository.create(aBrew({ method: 'espresso', brewedAt: daysAgo(3) }));

        const page = await repository.list({ method: 'v60', limit: 1 });

        expect(page.brews).toHaveLength(1);
        expect(page.brews[0]?.method).toBe('v60');
        expect(page.total).toBe(2);
      });
    });

    describe('update', () => {
      it('changes the fields it is given', async () => {
        const created = await repository.create(aBrew({ rating: 2 }));

        const updated = await repository.update(created.id, {
          rating: 5,
          tastingNotes: 'Better grind, completely different cup',
        });

        expect(updated?.rating).toBe(5);
        expect(updated?.tastingNotes).toBe('Better grind, completely different cup');
      });

      it('leaves the fields it is not given alone', async () => {
        const created = await repository.create(aBrew());

        const updated = await repository.update(created.id, { rating: 1 });

        expect(updated?.beans).toBe(created.beans);
        expect(updated?.method).toBe(created.method);
        expect(updated?.coffeeGrams).toBe(created.coffeeGrams);
        expect(updated?.waterGrams).toBe(created.waterGrams);
        expect(updated?.tastingNotes).toBe(created.tastingNotes);
        expect(updated?.brewedAt).toBe(created.brewedAt);
      });

      it('can change the method', async () => {
        const created = await repository.create(aBrew({ method: 'v60' }));

        const updated = await repository.update(created.id, { method: 'moka-pot' });

        expect(updated?.method).toBe('moka-pot');
        await expect(repository.list({ method: 'moka-pot' })).resolves.toMatchObject({ total: 1 });
        await expect(repository.list({ method: 'v60' })).resolves.toMatchObject({ total: 0 });
      });

      it('rounds grams the same way create does', async () => {
        const created = await repository.create(aBrew());

        const updated = await repository.update(created.id, { coffeeGrams: 15.128 });

        expect(updated?.coffeeGrams).toBe(15.13);
      });

      it('keeps the id and the creation time, and moves the update time', async () => {
        const created = await repository.create(aBrew());

        const updated = await repository.update(created.id, { rating: 3 });

        expect(updated?.id).toBe(created.id);
        expect(updated?.createdAt).toBe(created.createdAt);
        // Not `greaterThan`: an update landing in the same millisecond as the
        // insert is legitimate, and a test that fails once a fortnight on
        // timing teaches the team to re-run CI instead of to read failures.
        expect(Date.parse(updated?.updatedAt ?? '')).toBeGreaterThanOrEqual(
          Date.parse(created.updatedAt),
        );
      });

      it('persists the change rather than only returning it', async () => {
        const created = await repository.create(aBrew({ beans: 'Before' }));

        await repository.update(created.id, { beans: 'After' });

        const reread = await repository.findById(created.id);
        expect(reread?.beans).toBe('After');
      });

      it('returns null for an id nothing was ever stored under', async () => {
        await expect(repository.update(randomUUID(), { rating: 3 })).resolves.toBeNull();
      });

      it('returns null for a deleted brew, rather than quietly resurrecting it', async () => {
        const created = await repository.create(aBrew());
        await repository.softDelete(created.id);

        await expect(repository.update(created.id, { rating: 3 })).resolves.toBeNull();
        await expect(repository.list().then((page) => page.brews)).resolves.toEqual([]);
      });
    });

    describe('softDelete', () => {
      it('reports the deletion and hides the brew', async () => {
        const created = await repository.create(aBrew());

        await expect(repository.softDelete(created.id)).resolves.toBe(true);
        await expect(repository.findById(created.id)).resolves.toBeNull();
        await expect(repository.list().then((page) => page.brews)).resolves.toEqual([]);
      });

      it('reports nothing to do for an id nothing was ever stored under', async () => {
        await expect(repository.softDelete(randomUUID())).resolves.toBe(false);
      });

      it('reports nothing to do the second time', async () => {
        const created = await repository.create(aBrew());

        await expect(repository.softDelete(created.id)).resolves.toBe(true);
        await expect(repository.softDelete(created.id)).resolves.toBe(false);
      });

      it('deletes only the brew it was asked about', async () => {
        const kept = await repository.create(aBrew());
        const removed = await repository.create(aBrew());

        await repository.softDelete(removed.id);

        await expect(repository.findById(kept.id)).resolves.not.toBeNull();
      });
    });

    describe('stats', () => {
      /**
       * Numbers chosen to divide cleanly. Postgres averages `numeric` exactly
       * and JavaScript averages in binary floating point, so a value sitting on
       * a rounding boundary could round in different directions in the two
       * adapters. That is a real difference and worth knowing about, but a
       * contract test that fails on the seventeenth decimal place teaches
       * people to re-run CI rather than to read failures.
       */
      const ratioLadder = [
        { method: 'v60', coffeeGrams: 18, waterGrams: 288, rating: 5 }, // 1:16
        { method: 'v60', coffeeGrams: 18, waterGrams: 252, rating: 3 }, // 1:14
        { method: 'espresso', coffeeGrams: 18, waterGrams: 36, rating: 4 }, // 1:2
      ] as const;

      async function givenTheLadder(): Promise<void> {
        for (const [index, brew] of ratioLadder.entries()) {
          await repository.create(aBrew({ ...brew, brewedAt: daysAgo(index + 1) }));
        }
      }

      it('answers an empty log with zeroes rather than nothing', async () => {
        await expect(repository.stats()).resolves.toEqual(EMPTY_BREW_STATS);
      });

      it('returns stats the shared contract accepts', async () => {
        await givenTheLadder();
        const stats = await repository.stats();

        expect(() => brewStatsSchema.parse(stats)).not.toThrow();
      });

      it('counts the live brews', async () => {
        await givenTheLadder();

        await expect(repository.stats()).resolves.toMatchObject({
          brewCount: 3,
          methodsUsed: 2,
        });
      });

      it('averages the rating to two decimals, as the view does', async () => {
        await givenTheLadder();

        // (5 + 3 + 4) / 3 = 4
        expect((await repository.stats()).averageRating).toBe(4);
      });

      it('averages the ratio to one decimal, as the view does', async () => {
        await givenTheLadder();

        // (16 + 14 + 2) / 3 = 10.666..., to one decimal
        expect((await repository.stats()).averageRatio).toBe(10.7);
      });

      it('reports the first and last brew dates', async () => {
        await givenTheLadder();

        const stats = await repository.stats();

        expect(stats.lastBrewedAt).not.toBeNull();
        expect(stats.firstBrewedAt).not.toBeNull();
        expect(Date.parse(stats.lastBrewedAt ?? '')).toBeGreaterThan(
          Date.parse(stats.firstBrewedAt ?? ''),
        );
      });

      it('breaks the numbers down by method', async () => {
        await givenTheLadder();

        const v60 = (await repository.stats()).byMethod.find((row) => row.method === 'v60');

        expect(v60).toMatchObject({
          method: 'v60',
          label: 'V60',
          brewCount: 2,
          averageRating: 4,
          averageRatio: 15,
          minRatio: 14,
          maxRatio: 16,
        });
      });

      it('puts the most-brewed method first', async () => {
        await givenTheLadder();

        const stats = await repository.stats();

        expect(stats.byMethod.map((row) => row.method)).toEqual(['v60', 'espresso']);
      });

      it('leaves out methods with no brews, rather than listing them as zero', async () => {
        await givenTheLadder();

        const methods = (await repository.stats()).byMethod.map((row) => row.method);

        expect(methods).not.toContain('chemex');
      });

      it('ignores deleted brews', async () => {
        const kept = await repository.create(aBrew({ rating: 5 }));
        const removed = await repository.create(aBrew({ rating: 1, method: 'chemex' }));

        await repository.softDelete(removed.id);
        const stats = await repository.stats();

        expect(stats.brewCount).toBe(1);
        expect(stats.methodsUsed).toBe(1);
        expect(stats.averageRating).toBe(5);
        expect(stats.byMethod).toHaveLength(1);
        expect(stats.byMethod[0]?.method).toBe(kept.method);
      });

      it('goes back to the empty answer when the last brew is deleted', async () => {
        const only = await repository.create(aBrew());
        await repository.softDelete(only.id);

        await expect(repository.stats()).resolves.toEqual(EMPTY_BREW_STATS);
      });

      it('follows an update, rather than reporting what was first written', async () => {
        const created = await repository.create(aBrew({ rating: 1 }));

        await repository.update(created.id, { rating: 5 });

        expect((await repository.stats()).averageRating).toBe(5);
      });
    });

    describe('isolation', () => {
      /**
       * The in-memory adapter's characteristic failure, and the reason this
       * section exists: hand out the stored object itself and a caller who
       * edits the response has silently edited the database. Postgres cannot
       * fail this way, which is exactly why the guarantee has to be written
       * down — otherwise it holds only until the day the adapters swap.
       */
      it('hands out a copy, not the stored brew', async () => {
        const created = await repository.create(aBrew({ beans: 'Original' }));

        created.beans = 'Tampered with';
        created.rating = 1;

        const reread = await repository.findById(created.id);
        expect(reread?.beans).toBe('Original');
        expect(reread?.rating).toBe(5);
      });

      it('hands out a fresh copy on every read', async () => {
        const created = await repository.create(aBrew());

        const first = await repository.findById(created.id);
        const second = await repository.findById(created.id);

        expect(first).toEqual(second);
        expect(first).not.toBe(second);
      });

      it('hands out copies from the list too', async () => {
        const created = await repository.create(aBrew({ beans: 'Original' }));

        const [listed] = (await repository.list()).brews;
        if (listed) listed.beans = 'Tampered with';

        const reread = await repository.findById(created.id);
        expect(reread?.beans).toBe('Original');
      });
    });

    describe('flavour tags', () => {
      it('answers null for a brew that does not exist, from both methods', async () => {
        const id = randomUUID();

        expect(await repository.flavorTagsFor(id)).toBeNull();
        expect(await repository.replaceAiFlavorTags(id, [])).toBeNull();
      });

      it('answers an empty list for a brew nothing has tagged', async () => {
        const brew = await repository.create(aBrew());

        expect(await repository.flavorTagsFor(brew.id)).toEqual([]);
      });

      it('stores AI tags with their provenance and confidence, in vocabulary order', async () => {
        const brew = await repository.create(aBrew());

        const tags = await repository.replaceAiFlavorTags(brew.id, [
          { slug: 'floral', confidence: 0.9 },
          { slug: 'berry', confidence: 0.7 },
        ]);

        // Berry before floral would be input order; the vocabulary says
        // floral first. Every tag list reads in one order, whoever wrote it.
        expect(tags?.map((tag) => tag.slug)).toEqual(['floral', 'berry']);
        expect(tags?.every((tag) => tag.source === 'ai')).toBe(true);
        expect(tags?.find((tag) => tag.slug === 'berry')?.confidence).toBe(0.7);
        expect(tags?.find((tag) => tag.slug === 'berry')?.label).toBe('Berry');
      });

      it('replaces rather than accumulates, because tags describe the notes as they are', async () => {
        const brew = await repository.create(aBrew());

        await repository.replaceAiFlavorTags(brew.id, [{ slug: 'chocolate', confidence: 0.8 }]);
        const after = await repository.replaceAiFlavorTags(brew.id, [
          { slug: 'citrus', confidence: 0.6 },
        ]);

        expect(after?.map((tag) => tag.slug)).toEqual(['citrus']);
      });

      it('keeps two decimals of confidence, as the column does', async () => {
        const brew = await repository.create(aBrew());

        const tags = await repository.replaceAiFlavorTags(brew.id, [
          { slug: 'sweet', confidence: 0.876 },
        ]);

        expect(tags?.[0]?.confidence).toBe(0.88);
      });

      it('stops answering for a soft-deleted brew, like every other read', async () => {
        const brew = await repository.create(aBrew());
        await repository.replaceAiFlavorTags(brew.id, [{ slug: 'nutty', confidence: 0.9 }]);

        await repository.softDelete(brew.id);

        expect(await repository.flavorTagsFor(brew.id)).toBeNull();
        expect(
          await repository.replaceAiFlavorTags(brew.id, [{ slug: 'sweet', confidence: 0.5 }]),
        ).toBeNull();
      });

      it('hands out copies, so a response cannot mutate the store', async () => {
        const brew = await repository.create(aBrew());
        await repository.replaceAiFlavorTags(brew.id, [{ slug: 'earthy', confidence: 0.8 }]);

        const tags = await repository.flavorTagsFor(brew.id);
        if (tags?.[0]) tags[0].label = 'Tampered with';

        const reread = await repository.flavorTagsFor(brew.id);
        expect(reread?.[0]?.label).toBe('Earthy');
      });
    });
  });
}
