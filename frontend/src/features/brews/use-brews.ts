import type { Brew, BrewMethodSlug, CreateBrewInput, UpdateBrewInput } from '@crema/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brewKeys, brewsApi } from './brews-api';

/**
 * The brew log's data, as hooks.
 *
 * Every mutation invalidates the whole `brews` branch rather than patching the
 * cache by hand. The server owns `updatedAt`, and in Postgres it will own
 * `brewRatio` too, so a hand-patched cache would be subtly wrong the moment
 * either changed. Optimistic updates are Phase 5, where the rollback path can
 * be built and tested properly instead of assumed.
 */

export function useBrews(method?: BrewMethodSlug) {
  return useQuery({
    queryKey: brewKeys.list(method),
    queryFn: () => brewsApi.list(method),
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

function useInvalidateBrews() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: brewKeys.all });
    void queryClient.invalidateQueries({ queryKey: brewKeys.stats() });
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
