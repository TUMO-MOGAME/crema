import type { Brew, BrewMethodSlug, CreateBrewInput, UpdateBrewInput } from '@crema/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { brewKeys, brewsApi, PAGE_SIZE } from './brews-api';
import {
  applyChanges,
  insertBrew,
  optimisticBrew,
  removeBrew,
  replaceBrew,
  restoreLists,
  snapshotLists,
  type ListSnapshot,
} from './brews-cache';

/**
 * The brew log's data, as hooks.
 *
 * Every mutation writes to the cache before the request leaves, and every one
 * of them can put it back. The shape of that — snapshot, patch, restore on
 * failure, invalidate on settle — is the same three callbacks each time, so it
 * is written once in `optimistically` rather than three times with two of them
 * eventually drifting.
 *
 * The server still has the last word. `onSettled` invalidates unconditionally,
 * including after success, because the optimistic row is a good guess and not
 * the record: the server owns `updatedAt`, it owns the ordering, and under
 * Postgres it will own `brewRatio` too. What optimism buys is the half-second
 * before that lands, which is the half-second the interface feels slow in.
 */

/**
 * One filter's worth of brews, a page at a time.
 *
 * Infinite rather than a page number, because a log is read by scrolling down
 * it: "show me more" is the only navigation it wants, and page numbers would
 * make the reader keep their place themselves.
 *
 * The count comes back in the same response as the brews, which is the reason
 * the endpoint returns an envelope. It used to come from a *second* query for
 * the entire unfiltered log, fired on every render of the filtered view — the
 * page fetched all the brews in order to count the brews it had not fetched.
 */
export function useBrews(method?: BrewMethodSlug) {
  const query = useInfiniteQuery({
    queryKey: brewKeys.list(method),
    queryFn: ({ pageParam }) => brewsApi.list({ method, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const loaded = last.offset + last.brews.length;
      return loaded < last.total ? loaded : undefined;
    },
  });

  const pages = query.data?.pages ?? [];

  return {
    ...query,
    /**
     * Every page so far, flattened into one sequence, with duplicates dropped.
     *
     * The dedupe is not defensive tidying. An optimistic insert prepends to the
     * first page without moving the offsets the later pages were fetched at, so
     * for the moment before the refetch lands, the brew that was last on page
     * one is also first on page two. Rendering both is a duplicate React key
     * and a row that appears twice.
     */
    brews: uniqueById(pages.flatMap((page) => page.brews)),
    /** How many brews match the current filter, loaded or not. */
    total: pages[0]?.total ?? 0,
  };
}

function uniqueById(brews: Brew[]): Brew[] {
  const seen = new Set<string>();

  return brews.filter((brew) => {
    if (seen.has(brew.id)) return false;
    seen.add(brew.id);
    return true;
  });
}

export function useBrewMethods() {
  return useQuery({
    queryKey: brewKeys.methods(),
    queryFn: () => brewsApi.methods(),
    // Reference data. It changes when a migration runs, which is never in the
    // lifetime of a page.
    staleTime: Infinity,
  });
}

/** The flavour tags on one brew — fetched only while an edit dialog shows it. */
export function useFlavorTags(brewId: string | undefined) {
  return useQuery({
    queryKey: brewKeys.flavorTags(brewId ?? 'none'),
    queryFn: () => brewsApi.flavorTags(brewId ?? ''),
    enabled: brewId !== undefined,
  });
}

/**
 * The three callbacks every optimistic mutation here needs, given the one thing
 * that differs between them: what to do to the cache.
 *
 * `onMutate` snapshots every list query and applies the patch. `onError` puts
 * the snapshot back — all of it, because a mutation can touch several list
 * queries and restoring one would leave the others holding a value nothing will
 * ever refetch. `onSettled` invalidates whether it succeeded or failed, so the
 * server's version is what survives either way.
 */
function optimistically<TVariables>(client: QueryClient, patch: (variables: TVariables) => void) {
  return {
    onMutate: async (variables: TVariables): Promise<ListSnapshot> => {
      const snapshot = await snapshotLists(client);
      patch(variables);
      return snapshot;
    },
    onError: (_error: unknown, _variables: TVariables, snapshot: ListSnapshot | undefined) => {
      if (snapshot) restoreLists(client, snapshot);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: brewKeys.all });
    },
  };
}

export function useCreateBrew() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBrewInput) => brewsApi.create(input),
    ...optimistically(client, (input: CreateBrewInput) =>
      insertBrew(client, optimisticBrew(input)),
    ),
  });
}

export function useUpdateBrew() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ brew, changes }: UpdateBrewVariables) => brewsApi.update(brew.id, changes),
    // Applied to the brew as it was, not to the changes alone: a PATCH carries
    // only what the form submitted, and the row still has to render every field.
    ...optimistically(client, ({ brew, changes }: UpdateBrewVariables) =>
      replaceBrew(client, applyChanges(brew, changes)),
    ),
  });
}

/**
 * The whole brew, not just its id.
 *
 * The optimistic patch has to produce a complete `Brew` to put in the list, and
 * the changes on their own are partial by definition. Asking the caller for the
 * row it already has is cheaper than reading it back out of the cache and
 * handling the case where it is not there.
 */
export interface UpdateBrewVariables {
  brew: Brew;
  changes: UpdateBrewInput;
}

export function useDeleteBrew() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (brew: Brew) => brewsApi.remove(brew.id),
    ...optimistically(client, (brew: Brew) => removeBrew(client, brew.id)),
  });
}
