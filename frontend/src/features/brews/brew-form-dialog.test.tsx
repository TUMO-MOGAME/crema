import type { BrewProposal } from '@crema/shared';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { AppProviders } from '../../app/providers';
import { aBrew, stubApi } from '../../test/brew-fixtures';

/**
 * The brewed-at field, driven end to end: what the control shows, and — the
 * part that matters — exactly what instant reaches the API for each way of
 * leaving it. The field speaks the reader's local time; the contract speaks
 * ISO instants; and every test here pins one leg of that translation.
 */

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return {
    user: userEvent.setup(),
    ...render(
      <AppProviders client={client}>
        <App />
      </AppProviders>,
    ),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const BREWED_AT_LABEL = /^Brewed \(blank means now\)/;

/** The instant an ISO string names, written as the control writes it: local, to the minute. */
function asLocalControlValue(iso: string): string {
  const date = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Beans/), 'Kenyan Peaberry');
  await user.selectOptions(screen.getByLabelText(/^Method/), 'v60');
  await user.type(screen.getByLabelText(/^Coffee grams/), '18');
  await user.type(screen.getByLabelText(/^Water grams/), '300');
  await user.type(screen.getByLabelText(/^Rating/), '4');
  await user.type(screen.getByLabelText(/^Tasting notes/), 'Bright and clean');
}

describe('the brewed-at field', () => {
  it('starts blank on the add form, and a blank field sends no brewedAt at all', async () => {
    const { calls } = stubApi({ brews: [] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText(BREWED_AT_LABEL)).toHaveValue('');

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });

    const created = calls.find((call) => call.method === 'POST');
    // Absent, not null and not '': the server's `default now()` owns the
    // moment a brew logged live actually happened.
    expect(created?.body).not.toHaveProperty('brewedAt');
  });

  it('sends the instant a chosen local time names — yesterday, logged honestly', async () => {
    const { calls } = stubApi({ brews: [] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(BREWED_AT_LABEL), '2026-08-13T07:30');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });

    const created = calls.find((call) => call.method === 'POST');
    // Computed the same way the browser reads the control — as local time —
    // so the assertion holds in any timezone a test machine happens to be in.
    expect((created?.body as { brewedAt: string }).brewedAt).toBe(
      new Date('2026-08-13T07:30').toISOString(),
    );
  });

  it('shows the brew’s own instant when editing', async () => {
    stubApi({ brews: [aBrew({ brewedAt: '2026-08-05T06:00:00.000Z' })] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));

    expect(screen.getByLabelText(BREWED_AT_LABEL)).toHaveValue(
      asLocalControlValue('2026-08-05T06:00:00.000Z'),
    );
  });

  it('keeps the exact stored instant when an edit leaves the field alone', async () => {
    // The control speaks in minutes; the stored instant carries seconds. An
    // edit that never touched the field must not round them away.
    const stored = '2026-08-05T06:00:42.000Z';
    const { calls } = stubApi({ brews: [aBrew({ brewedAt: stored })] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));
    await user.type(screen.getByLabelText(/^Tasting notes/), ' — still lovely');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });

    const updated = calls.find((call) => call.method === 'PATCH');
    expect((updated?.body as { brewedAt: string }).brewedAt).toBe(stored);
  });

  it('sends the new instant when an edit changes it', async () => {
    const { calls } = stubApi({ brews: [aBrew()] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));

    const field = screen.getByLabelText(BREWED_AT_LABEL);
    await user.clear(field);
    await user.type(field, '2026-08-01T15:45');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });

    const updated = calls.find((call) => call.method === 'PATCH');
    expect((updated?.body as { brewedAt: string }).brewedAt).toBe(
      new Date('2026-08-01T15:45').toISOString(),
    );
  });

  it('shows a proposal’s brewedAt in the control instead of carrying it invisibly', async () => {
    const proposal = {
      brew: { beans: 'Ethiopian Yirgacheffe', brewedAt: '2026-08-13T05:30:00.000Z' },
      inferred: [],
    } satisfies BrewProposal;

    stubApi({ brews: [], ai: { proposal } });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('Say it in a sentence'), 'yesterday 5:30 brew');
    await user.click(screen.getByRole('button', { name: 'Pre-fill' }));

    await waitFor(() => {
      expect(screen.getByLabelText(BREWED_AT_LABEL)).toHaveValue(
        asLocalControlValue('2026-08-13T05:30:00.000Z'),
      );
    });
  });
});
