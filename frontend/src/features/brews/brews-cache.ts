import type { Brew, BrewMethodSlug, BrewPage, UpdateBrewInput } from '@crema/shared';
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { brewKeys } from './brews-api';

/**
 * Editing the brew list cache in place, so a change appears before the server
 * has agreed to it.
 *
 * All of this exists because the list is paged. A single-array cache would make
 * an optimistic update three lines; an `InfiniteData<BrewPage>` makes it a
 * handful of rules that are each easy to get wrong and silent when you do:
 *
 *   1. **Every page carries the same `total`.** `useBrews` reads it from the
 *      first page and `getNextPageParam` reads it from the last, so a patch
 *      that updates one page's total leaves those two disagreeing — the header
 *      count says one thing and "Load more" believes another. Every helper here
 *      rewrites the total on all pages or on none.
 *   2. **There is more than one list query.** The page runs a filtered list and
 *      an unfiltered one for the tab title, and every filter ever opened stays
 *      cached. A new brew belongs in some of them and not others, and that is
 *      decided per query from the method in its key.
 *   3. **Rollback has to restore all of them.** Snapshotting one query and
 *      restoring one query would leave the others holding the optimistic
 *      value forever, because nothing refetches a query that was never
 *      invalidated.
 */

/** What a list query holds: pages, in the order they were loaded. */
type BrewListCache = InfiniteData<BrewPage, number>;

/** Every list query's key and data, as taken before a mutation. */
export type ListSnapshot = [QueryKey, BrewListCache | undefined][];

/**
 * The method a list query is filtered to.
 *
 * `brewKeys.list()` builds `['brews', 'list', method ?? 'all']`, so the filter
 * is readable from the key without keeping a second registry of live queries.
 */
function filterOf(key: QueryKey): BrewMethodSlug | 'all' {
  const method = key[2];
  return typeof method === 'string' ? (method as BrewMethodSlug | 'all') : 'all';
}

function matchesFilter(brew: Brew, key: QueryKey): boolean {
  const filter = filterOf(key);
  return filter === 'all' || filter === brew.method;
}

/** The same pages with a new total on each one. See rule 1. */
function withTotal(cache: BrewListCache, change: number): BrewListCache {
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      // Never below zero: two deletes racing the same brew would otherwise
      // leave a count that reads as impossible rather than merely stale.
      total: Math.max(0, page.total + change),
    })),
  };
}

/**
 * Stops in-flight refetches and takes a copy of every list query.
 *
 * Cancelling first is what stops a request that left before the mutation from
 * landing after it and overwriting the optimistic value with a list that
 * predates it.
 */
export async function snapshotLists(client: QueryClient): Promise<ListSnapshot> {
  await client.cancelQueries({ queryKey: brewKeys.lists() });
  return client.getQueriesData<BrewListCache>({ queryKey: brewKeys.lists() });
}

/** Puts every list query back as it was. The whole point of the snapshot. */
export function restoreLists(client: QueryClient, snapshot: ListSnapshot): void {
  for (const [key, data] of snapshot) client.setQueryData(key, data);
}

/** Applies `patch` to every cached list query that has data. */
function eachList(
  client: QueryClient,
  patch: (cache: BrewListCache, key: QueryKey) => BrewListCache,
): void {
  for (const [key, cache] of client.getQueriesData<BrewListCache>({ queryKey: brewKeys.lists() })) {
    if (cache) client.setQueryData(key, patch(cache, key));
  }
}

/**
 * Shows a brew that has not been saved yet.
 *
 * It goes at the head of the first page because the list is newest-brewed
 * first and a brew logged now is the newest thing in it. A brew backdated by
 * the form belongs further down, and putting it at the top anyway is the right
 * trade: it is where the reader is looking, it is visibly the thing they just
 * did, and the refetch on settle moves it to its real position.
 *
 * Lists filtered to a different method are left alone entirely — including
 * their totals, because the brew was never one of the rows they count.
 */
export function insertBrew(client: QueryClient, brew: Brew): void {
  eachList(client, (cache, key) => {
    if (!matchesFilter(brew, key)) return cache;

    const [first, ...rest] = cache.pages;
    if (!first) return cache;

    return withTotal(
      { ...cache, pages: [{ ...first, brews: [brew, ...first.brews] }, ...rest] },
      1,
    );
  });
}

/**
 * Replaces a brew wherever it is held.
 *
 * An edit can move a brew out of the list it is being viewed in — change the
 * method while the filter is set to the old one and it no longer belongs. That
 * is handled as a removal rather than left to the refetch, because the
 * alternative is a row visibly contradicting the filter above it.
 *
 * Position within the list is *not* corrected. Editing `brewedAt` changes where
 * the brew sorts, and re-sorting the pages here would mean reimplementing the
 * ordering the API already owns — including its tiebreakers — in a second
 * place, to be right for the half-second before the refetch lands.
 */
export function replaceBrew(client: QueryClient, brew: Brew): void {
  eachList(client, (cache, key) => {
    const held = cache.pages.some((page) => page.brews.some((row) => row.id === brew.id));
    if (!held) {
      // It was not in this list and now belongs in it — an edit that moved a
      // brew *into* the filter being viewed.
      return matchesFilter(brew, key) ? insertInto(cache, brew) : cache;
    }

    if (!matchesFilter(brew, key)) return removeFrom(cache, brew.id);

    return {
      ...cache,
      pages: cache.pages.map((page) => ({
        ...page,
        brews: page.brews.map((row) => (row.id === brew.id ? brew : row)),
      })),
    };
  });
}

/** Takes a brew out of every list holding it, and off every count. */
export function removeBrew(client: QueryClient, id: string): void {
  eachList(client, (cache) => {
    const held = cache.pages.some((page) => page.brews.some((row) => row.id === id));
    return held ? removeFrom(cache, id) : cache;
  });
}

function insertInto(cache: BrewListCache, brew: Brew): BrewListCache {
  const [first, ...rest] = cache.pages;
  if (!first) return cache;

  return withTotal({ ...cache, pages: [{ ...first, brews: [brew, ...first.brews] }, ...rest] }, 1);
}

function removeFrom(cache: BrewListCache, id: string): BrewListCache {
  return withTotal(
    {
      ...cache,
      pages: cache.pages.map((page) => ({
        ...page,
        brews: page.brews.filter((row) => row.id !== id),
      })),
    },
    -1,
  );
}

/**
 * A brew with an update applied to it.
 *
 * Assigned field by field rather than spread, for the reason the in-memory
 * repository gives for doing the same: a parsed partial can carry keys that are
 * present and `undefined`, and spreading copies those over good values.
 * `exactOptionalPropertyTypes` catches it here at compile time, which is how
 * this function came to exist rather than a `{ ...brew, ...changes }` that
 * would have blanked a field the moment a form submitted one as undefined.
 */
export function applyChanges(brew: Brew, changes: UpdateBrewInput): Brew {
  return {
    ...brew,
    ...(changes.beans === undefined ? {} : { beans: changes.beans }),
    ...(changes.method === undefined ? {} : { method: changes.method }),
    ...(changes.coffeeGrams === undefined ? {} : { coffeeGrams: changes.coffeeGrams }),
    ...(changes.waterGrams === undefined ? {} : { waterGrams: changes.waterGrams }),
    ...(changes.rating === undefined ? {} : { rating: changes.rating }),
    ...(changes.tastingNotes === undefined ? {} : { tastingNotes: changes.tastingNotes }),
    ...(changes.brewedAt === undefined ? {} : { brewedAt: changes.brewedAt }),
    // A guess at what the server will stamp. It is replaced by the real value
    // on settle; it is set at all so a row that was just edited does not read
    // as untouched in the moment before that.
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A brew as it will look once saved, for showing before it is.
 *
 * The server owns `id`, `createdAt` and `updatedAt`, so these are stand-ins
 * that live only until the response replaces them. The id is a real UUID
 * rather than a marker like `temp-1`, because it is used as a React key and as
 * the identity for the update that follows — and because a value the schema
 * would reject has a way of ending up somewhere that validates it.
 */
export function optimisticBrew(
  input: Omit<Brew, 'id' | 'createdAt' | 'updatedAt' | 'brewedAt'> & {
    brewedAt?: string | undefined;
  },
): Brew {
  // prettier-ignore
  const now = new Date().toISOString();

  return {
    ...input,
    id: crypto.randomUUID(),
    brewedAt: input.brewedAt ?? now,
    createdAt: now,
    updatedAt: now,
  };
}
