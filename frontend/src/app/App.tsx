import { useQuery } from '@tanstack/react-query';
import { brewCountTitle, useDocumentTitle } from '../hooks/use-document-title';
import { apiRequest } from '../lib/api-client';

interface HealthResponse {
  status: string;
  environment: string;
  dataSource: 'memory' | 'postgres';
  ai: { enabled: boolean; model: string | null };
}

/**
 * Phase 0 shell.
 *
 * It exists to prove the whole chain is wired — browser to API to shared
 * contract — before any feature work leans on it. The brew log replaces this
 * in Phase 4.
 */
export function App() {
  useDocumentTitle(brewCountTitle(0));

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiRequest<HealthResponse>('/api/health'),
  });

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-bean-50 text-5xl font-semibold tracking-tight">Crema</h1>
        <p className="text-bean-200 text-lg text-balance">
          Log every brew, spot what actually made it good, and know what to change next time.
        </p>
      </header>

      <section
        aria-labelledby="status-heading"
        className="border-bean-800 bg-bean-900/60 rounded-[--radius-card] border p-6"
      >
        <h2
          id="status-heading"
          className="text-bean-400 text-sm font-medium tracking-wide uppercase"
        >
          API connection
        </h2>

        <div className="mt-4" aria-live="polite">
          {health.isPending && <p className="text-bean-200">Checking…</p>}

          {health.isError && (
            <div className="space-y-2">
              <p className="text-bean-100">Not connected.</p>
              <p className="text-bean-400 text-sm">{health.error.message}</p>
              <p className="text-bean-400 text-sm">
                Start it with <code className="text-crema-400">npm run dev</code>.
              </p>
            </div>
          )}

          {health.isSuccess && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-bean-400">Status</dt>
              <dd className="text-crema-400">{health.data.status}</dd>

              <dt className="text-bean-400">Data source</dt>
              <dd className="text-bean-100">{health.data.dataSource}</dd>

              <dt className="text-bean-400">Brew coach</dt>
              <dd className="text-bean-100">
                {health.data.ai.enabled
                  ? health.data.ai.model
                  : 'not configured on this deployment'}
              </dd>
            </dl>
          )}
        </div>
      </section>
    </main>
  );
}
