import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The floor under the whole tree.
 *
 * React's answer to an uncaught render error is to unmount everything, which
 * for the person using the app is a blank page with no explanation and no way
 * back. Every failure below this point already has a home — fetches have error
 * states, mutations roll back and toast, the offline banner covers the
 * connection — so anything that reaches here is a bug, and the honest response
 * is to say so and offer the one action that reliably helps.
 *
 * A class, because boundaries still are one: `getDerivedStateFromError` has no
 * hook equivalent. The only class component in the app, and it earns the
 * exception by being the thing function components cannot do.
 *
 * Reload rather than "try again": re-rendering the same tree over the same
 * state that just threw mostly throws again, and a button that fails twice
 * teaches the reader the app is broken. A reload starts from the server's
 * truth, which is exactly what the optimistic layer was already treating as
 * the record.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The one thing a blank screen never gives anyone: something in the log.
    console.error('crema: the interface crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main
        role="alert"
        className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-start justify-center gap-3 px-5 py-10"
      >
        <h1 className="font-display text-ink-strong text-2xl font-semibold tracking-tight">
          Something broke.
        </h1>
        <p className="text-ink text-body">
          Not your brews — those are saved on the server. The page itself hit an error it could not
          recover from.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-pill bg-ink-strong text-surface text-body mt-2 cursor-pointer px-6 py-2.5 font-medium transition-opacity hover:opacity-90"
        >
          Reload the page
        </button>
      </main>
    );
  }
}
