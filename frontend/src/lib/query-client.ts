import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

/**
 * Retrying a 400 with the same body produces the same 400. The default retry
 * policy does not know that, so it is replaced with one that reads the error.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && !error.isRetryable) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
