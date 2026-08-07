import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router';
import { ToastProvider } from '../components/toast';
import { createQueryClient } from '../lib/query-client';
import { applyTheme, readTheme } from '../lib/theme';

let sharedClient: QueryClient | undefined;

function defaultClient(): QueryClient {
  sharedClient ??= createQueryClient();
  return sharedClient;
}

interface AppProvidersProps {
  children: ReactNode;
  /** Tests pass a throwaway client so state never leaks between cases. */
  client?: QueryClient;
  /** Tests render without a router when they supply their own. */
  router?: boolean;
}

export function AppProviders({ children, client, router = true }: AppProvidersProps) {
  // Restores the remembered theme on load. Without it the first paint follows
  // the system preference and then snaps to the stored choice, which is a flash
  // of the wrong theme at exactly the hour it is least welcome.
  useEffect(() => {
    applyTheme(readTheme());
  }, []);

  const tree = (
    <QueryClientProvider client={client ?? defaultClient()}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );

  return router ? <BrowserRouter>{tree}</BrowserRouter> : tree;
}
