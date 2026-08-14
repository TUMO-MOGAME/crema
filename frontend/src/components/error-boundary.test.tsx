import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';

/**
 * React logs every caught error to the console even when a boundary handles
 * it, and the boundary adds a line of its own. Both are correct in production
 * and noise here, so the console is silenced per test and restored after.
 */
function Broken(): never {
  throw new Error('deliberate render failure');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children while nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>the app</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces a crashed tree with the fallback instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something broke.');
    // The one promise worth making at this moment: the data is not the thing
    // that failed.
    expect(alert).toHaveTextContent('Not your brews');
  });

  it('logs what crashed, because the blank page never did', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(log).toHaveBeenCalledWith(
      'crema: the interface crashed',
      expect.any(Error),
      expect.anything(),
    );
  });

  it('offers a reload, the one action that reliably recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reload the page' }));

    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
