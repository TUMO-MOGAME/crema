import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createQueryClient } from '../lib/query-client';

let sharedClient: QueryClient | undefined;

function defaultClient(): QueryClient {
  sharedClient ??= createQueryClient();
  return sharedClient;
}

interface AppProvidersProps {
  children: ReactNode;
  /** Tests pass a throwaway client so state never leaks between cases. */
  client?: QueryClient;
}

export function AppProviders({ children, client }: AppProvidersProps) {
  return <QueryClientProvider client={client ?? defaultClient()}>{children}</QueryClientProvider>;
}
