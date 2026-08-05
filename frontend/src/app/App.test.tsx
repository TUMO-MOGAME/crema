import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AppProviders } from './providers';

const healthPayload = {
  status: 'ok',
  environment: 'development',
  dataSource: 'memory',
  ai: { enabled: false, model: null },
};

function stubHealth(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

function renderApp() {
  // Retries off and a fresh cache per test, so no state leaks between cases.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AppProviders client={client}>
      <App />
    </AppProviders>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('names the product', () => {
    stubHealth(healthPayload);
    renderApp();

    expect(screen.getByRole('heading', { level: 1, name: 'Crema' })).toBeInTheDocument();
  });

  it('sets the page title to the brew count format the brief requires', () => {
    stubHealth(healthPayload);
    renderApp();

    expect(document.title).toBe('Brews: 0');
  });

  it('shows a checking state before the API answers', () => {
    stubHealth(healthPayload);
    renderApp();

    expect(screen.getByText('Checking…')).toBeInTheDocument();
  });

  it('reports which persistence adapter the API is running on', async () => {
    stubHealth(healthPayload);
    renderApp();

    expect(await screen.findByText('memory')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('says the coach is unconfigured rather than showing a broken feature', async () => {
    stubHealth(healthPayload);
    renderApp();

    expect(await screen.findByText('not configured on this deployment')).toBeInTheDocument();
  });

  it('names the model once the coach is configured', async () => {
    stubHealth({ ...healthPayload, ai: { enabled: true, model: 'gemini-flash-latest' } });
    renderApp();

    expect(await screen.findByText('gemini-flash-latest')).toBeInTheDocument();
  });

  it('explains how to recover when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderApp();

    expect(await screen.findByText('Not connected.')).toBeInTheDocument();
    expect(screen.getByText('npm run dev')).toBeInTheDocument();
  });

  it('announces status changes to assistive technology', () => {
    stubHealth(healthPayload);
    const { container } = renderApp();

    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
