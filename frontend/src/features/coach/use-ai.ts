import { useMutation, useQuery } from '@tanstack/react-query';
import { aiApi, aiKeys } from './ai-api';

/**
 * Whether this deployment has an AI behind it.
 *
 * Read from `/api/health`, which reports the service the requests actually go
 * to — not from an environment variable the bundle was built with, which would
 * answer a different question. The value cannot change without a redeploy, so
 * it is fetched once and kept.
 *
 * `false` while loading and `false` on failure, on purpose: the AI surfaces
 * are an enhancement, and the honest degraded state is their absence. A brief
 * appearance-then-removal would be worse than arriving a beat late, and a
 * health endpoint that cannot be reached is not a deployment to advertise
 * features on.
 */
export function useAiEnabled(): boolean {
  const query = useQuery({
    queryKey: aiKeys.health,
    queryFn: aiApi.health,
    staleTime: Infinity,
  });

  return query.data?.ai.enabled ?? false;
}

/**
 * The Quick Log call, as a mutation.
 *
 * A mutation rather than a query even though nothing is written, because it has
 * mutation semantics everywhere it matters: fired by a click, never refetched
 * on focus, one in flight at a time, and its error belongs to the attempt
 * rather than to the screen.
 */
export function useQuickLog() {
  return useMutation({
    mutationFn: (text: string) => aiApi.quickLog(text),
  });
}
