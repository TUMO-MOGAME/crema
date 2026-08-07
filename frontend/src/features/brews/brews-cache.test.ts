import type { Brew, BrewPage } from '@crema/shared';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { aBrew, anId } from '../../test/brew-fixtures';
import { brewKeys, PAGE_SIZE } from './brews-api';
import { applyChanges, insertBrew, removeBrew, replaceBrew, restoreLists, snapshotLists } from './brews-cache'; // prettier-ignore

/**
 * The cache rules, tested directly rather than only through the screen.
 *
 * These are the parts of optimistic updating that are wrong silently. A total
 * left on one page and not another does not throw, does not warn, and does not
 * look wrong — it shows the right number in the header while "Load more"
 * believes something else, and only at a page boundary.
 */

type Cache = InfiniteData<BrewPage, number>;

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

/** A cached list of `count` brews, split into pages of `PAGE_SIZE`. */
function seedList(count: number, method?: 'v60' | 'espresso'): Cache {
  const brews = Array.from({ length: count }, (_, index) =>
    aBrew({ id: anId(index + 1), beans: `Brew ${index + 1}`, ...(method ? { method } : {}) }),
  );

  const pages: BrewPage[] = [];
  for (let offset = 0; offset < count; offset += PAGE_SIZE) {
    pages.push({
      brews: brews.slice(offset, offset + PAGE_SIZE),
      total: count,
      limit: PAGE_SIZE,
      offset,
    });
  }

  return { pages, pageParams: pages.map((page) => page.offset) };
}

function put(cache: Cache, method?: 'v60' | 'espresso'): void {
  client.setQueryData(brewKeys.list(method), cache);
}

function read(method?: 'v60' | 'espresso'): Cache | undefined {
  return client.getQueryData<Cache>(brewKeys.list(method));
}

const totalsOf = (cache: Cache | undefined) => cache?.pages.map((page) => page.total);
const idsOf = (cache: Cache | undefined) => cache?.pages.flatMap((page) => page.brews.map((b) => b.id)); // prettier-ignore

describe('inserting a brew', () => {
  it('puts it at the top, where the reader is looking', () => {
    put(seedList(3));

    const brew = aBrew({ id: anId(99), beans: 'Just logged' });
    insertBrew(client, brew);

    expect(idsOf(read())?.[0]).toBe(brew.id);
  });

  /**
   * The rule that makes the rest of it work. `useBrews` reads the total from
   * the first page and `getNextPageParam` reads it from the last; updating one
   * leaves the header and the paging disagreeing.
   */
  it('raises the total on every page, not just the one it touched', () => {
    put(seedList(120)); // three pages

    expect(totalsOf(read())).toEqual([120, 120, 120]);

    insertBrew(client, aBrew({ id: anId(999) }));

    expect(totalsOf(read())).toEqual([121, 121, 121]);
  });

  it('leaves a list filtered to another method completely alone', () => {
    put(seedList(2, 'espresso'), 'espresso');

    insertBrew(client, aBrew({ id: anId(50), method: 'v60' }));

    const espresso = read('espresso');
    expect(idsOf(espresso)).toHaveLength(2);
    // Not merely absent from the rows — absent from the count as well, because
    // it was never one of the brews that list is counting.
    expect(totalsOf(espresso)).toEqual([2]);
  });

  it('appears in a list filtered to its own method', () => {
    put(seedList(2, 'v60'), 'v60');

    insertBrew(client, aBrew({ id: anId(50), method: 'v60' }));

    expect(idsOf(read('v60'))).toHaveLength(3);
    expect(totalsOf(read('v60'))).toEqual([3]);
  });

  it('updates every cached filter at once', () => {
    put(seedList(2));
    put(seedList(1, 'v60'), 'v60');
    put(seedList(1, 'espresso'), 'espresso');

    insertBrew(client, aBrew({ id: anId(50), method: 'v60' }));

    expect(totalsOf(read())).toEqual([3]); // unfiltered: yes
    expect(totalsOf(read('v60'))).toEqual([2]); // its own method: yes
    expect(totalsOf(read('espresso'))).toEqual([1]); // another method: no
  });
});

describe('removing a brew', () => {
  it('takes it out and lowers every total', () => {
    put(seedList(120));

    removeBrew(client, anId(60));

    expect(idsOf(read())).not.toContain(anId(60));
    expect(totalsOf(read())).toEqual([119, 119, 119]);
  });

  it('does not touch a list that never held it', () => {
    put(seedList(2, 'espresso'), 'espresso');

    removeBrew(client, anId(9999));

    expect(totalsOf(read('espresso'))).toEqual([2]);
  });

  it('never reports a negative count', () => {
    put(seedList(1));

    removeBrew(client, anId(1));
    removeBrew(client, anId(1));

    expect(totalsOf(read())).toEqual([0]);
  });
});

describe('replacing a brew', () => {
  it('swaps it in place', () => {
    put(seedList(3));

    replaceBrew(client, aBrew({ id: anId(2), beans: 'Renamed' }));

    const brews = read()?.pages.flatMap((page) => page.brews) ?? [];
    expect(brews.find((brew) => brew.id === anId(2))?.beans).toBe('Renamed');
    // A replacement is not an insertion.
    expect(totalsOf(read())).toEqual([3]);
  });

  it('drops a brew edited out of the filter being viewed', () => {
    put(seedList(2, 'v60'), 'v60');

    // The brew was a v60; it is now an espresso, so it no longer belongs in a
    // list filtered to v60. Leaving it would show a row contradicting the
    // filter above it.
    replaceBrew(client, aBrew({ id: anId(1), method: 'espresso' }));

    expect(idsOf(read('v60'))).not.toContain(anId(1));
    expect(totalsOf(read('v60'))).toEqual([1]);
  });

  it('adds a brew edited into the filter being viewed', () => {
    put(seedList(1, 'espresso'), 'espresso');

    replaceBrew(client, aBrew({ id: anId(77), method: 'espresso' }));

    expect(idsOf(read('espresso'))).toContain(anId(77));
    expect(totalsOf(read('espresso'))).toEqual([2]);
  });
});

describe('snapshot and restore', () => {
  it('puts every list back, not just the one that changed', async () => {
    put(seedList(2));
    put(seedList(2, 'v60'), 'v60');

    const snapshot = await snapshotLists(client);
    insertBrew(client, aBrew({ id: anId(50), method: 'v60' }));

    // Both lists took the insert.
    expect(totalsOf(read())).toEqual([3]);
    expect(totalsOf(read('v60'))).toEqual([3]);

    restoreLists(client, snapshot);

    // Restoring one and forgetting the other would leave a count nothing
    // refetches, because nothing invalidated it.
    expect(totalsOf(read())).toEqual([2]);
    expect(totalsOf(read('v60'))).toEqual([2]);
  });

  it('restores the rows themselves, not only the counts', async () => {
    put(seedList(3));
    const before = idsOf(read());

    const snapshot = await snapshotLists(client);
    removeBrew(client, anId(2));
    restoreLists(client, snapshot);

    expect(idsOf(read())).toEqual(before);
  });
});

describe('applying changes to a brew', () => {
  const original: Brew = aBrew({ beans: 'Original', rating: 3 });

  it('takes the fields it is given', () => {
    const updated = applyChanges(original, { rating: 5 });

    expect(updated.rating).toBe(5);
  });

  it('leaves the fields it is not given', () => {
    const updated = applyChanges(original, { rating: 5 });

    expect(updated.beans).toBe('Original');
    expect(updated.method).toBe(original.method);
    expect(updated.brewedAt).toBe(original.brewedAt);
  });

  /**
   * The reason this is a function rather than a spread. A partial parsed from a
   * form can carry keys that are present and undefined, and `{ ...brew,
   * ...changes }` copies those over good values — blanking a field the user
   * never touched.
   */
  it('does not blank a field whose change is present but undefined', () => {
    const updated = applyChanges(original, { beans: undefined, rating: 4 });

    expect(updated.beans).toBe('Original');
    expect(updated.rating).toBe(4);
  });

  it('stamps updatedAt, so an edited row does not read as untouched', () => {
    const updated = applyChanges(original, { rating: 1 });

    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(original.updatedAt));
  });
});
