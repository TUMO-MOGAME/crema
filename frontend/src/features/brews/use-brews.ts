import type { Brew, BrewMethodSlug, CreateBrewInput, UpdateBrewInput } from '@crema/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brewKeys, brewsApi, PAGE_SIZE } from './brews-api';

/**
 * The brew log's data, as hooks.
 *
 * Every mutation invalidates the whole `brews` branch rather than patching the
 * cache by hand. The server owns `updatedAt`, and in Postgres it will own
 * `brewRatio` too, so a hand-patched cache would be subtly wrong the moment
 * either changed. Optimistic updates are Phase 5, where the rollback path can
 * be built and tested properly instead of assumed.
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
    /** Every page so far, flattened — the list renders one sequence, not pages. */
    brews: pages.flatMap((page) => page.brews),
    /** How many brews match the current filter, loaded or not. */
    total: pages[0]?.total ?? 0,
  };
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

function useInvalidateBrews() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: brewKeys.all });
  };
}

export function useCreateBrew() {
  const invalidate = useInvalidateBrews();

  return useMutation({
    mutationFn: (input: CreateBrewInput) => brewsApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateBrew() {
  const invalidate = useInvalidateBrews();

  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateBrewInput }) =>
      brewsApi.update(id, changes),
    onSuccess: invalidate,
  });
}

export function useDeleteBrew() {
  const invalidate = useInvalidateBrews();

  return useMutation({
    mutationFn: (brew: Brew) => brewsApi.remove(brew.id),
    onSuccess: invalidate,
  });
}
