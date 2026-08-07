import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, EXIT_DURATION_MS } from './dialog';

/**
 * Focus management, which is the part of a modal that is invisible until it is
 * wrong. The dialog used to unmount itself on close, so `close()` never ran and
 * the browser never restored focus — it fell to `<body>`, and a keyboard user
 * lost their place every time they dismissed one.
 */
function Harness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="A dialog">
        <button type="button">Inside</button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('returns focus to the control that opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(document.activeElement).toBe(trigger);
  });

  it('holds no contents while it is closed', () => {
    render(<Harness />);

    // A closed dialog is not a hidden copy of the form. Nothing inside it is
    // findable, and it carries no accessible name to be confused with.
    expect(screen.queryByRole('heading', { name: 'A dialog' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'A dialog' })).not.toBeInTheDocument();
  });

  it('is named by its title once open, so a screen reader announces which one', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('dialog', { name: 'A dialog' })).toBeInTheDocument();
  });
});

/**
 * The exit, which the rest of the suite runs with reduced motion and therefore
 * never sees. These stub the preference the other way so the timed path is
 * actually covered.
 */
describe('closing with motion', () => {
  function wantsMotion() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, // i.e. does not prefer reduced motion
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the contents on screen while the exit plays', async () => {
    wantsMotion();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Still there — animating an empty box away is the thing this avoids.
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument();
  });

  it('marks the dialog as closing, which is what the animation keys on', async () => {
    wantsMotion();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(document.querySelector('dialog')).toHaveAttribute('data-closing');
  });

  it('finishes: contents go and focus comes back', async () => {
    wantsMotion();
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(
      () => {
        expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
        expect(document.activeElement).toBe(trigger);
      },
      { timeout: EXIT_DURATION_MS * 4 },
    );
  });

  it('does not wait when the reader asked for less motion', async () => {
    // The default in this suite. Focus is back without waiting for a timer.
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
  });
});
