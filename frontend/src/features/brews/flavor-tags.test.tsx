import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { AppProviders } from '../../app/providers';
import { aBrew, stubApi } from '../../test/brew-fixtures';

/**
 * Flavour tagging, from the outside: saving a brew asks for its notes to be
 * tagged, and editing one shows what the notes read as — with the AI's work
 * labelled as the AI's.
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

async function addABrew(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Add' }));
  await user.type(screen.getByLabelText('Beans'), 'Kenyan AA');
  await user.selectOptions(screen.getByLabelText('Method'), 'chemex');
  await user.type(screen.getByLabelText('Coffee grams'), '22');
  await user.type(screen.getByLabelText('Water grams'), '352');
  await user.type(screen.getByLabelText('Rating (out of 5)'), '4');
  await user.type(screen.getByLabelText('Tasting notes'), 'Milk chocolate, orange peel');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Brew added.');
}

describe('flavour tagging', () => {
  it('asks for the saved brew to be tagged, after the save and never before', async () => {
    const { calls } = stubApi({ brews: [], ai: {} });
    const { user } = renderApp();

    await addABrew(user);

    await waitFor(() => {
      const extraction = calls.find((call) => call.url.includes('/api/ai/flavor-tags'));
      expect(extraction?.method).toBe('POST');
    });

    // The extraction names the brew; the notes stay server-side.
    const extraction = calls.find((call) => call.url.includes('/api/ai/flavor-tags'));
    expect(extraction?.body).toHaveProperty('brewId');
    expect(JSON.stringify(extraction?.body)).not.toContain('chocolate');
  });

  it('asks for nothing on a deployment without AI', async () => {
    const { calls } = stubApi({ brews: [] });
    const { user } = renderApp();

    await addABrew(user);

    expect(calls.some((call) => call.url.includes('/api/ai/flavor-tags'))).toBe(false);
  });

  it('shows what the notes read as when editing, labelled as the AI’s work', async () => {
    stubApi({
      brews: [aBrew()],
      ai: {
        flavorTags: [
          { slug: 'berry', label: 'Berry', source: 'ai', confidence: 0.9 },
          { slug: 'floral', label: 'Floral', source: 'ai', confidence: 0.7 },
        ],
      },
    });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));

    expect(await screen.findByText('Berry')).toBeInTheDocument();
    expect(screen.getByText('Floral')).toBeInTheDocument();
    expect(screen.getByText('tagged by AI')).toBeInTheDocument();
  });

  it('shows no tag row for a brew whose notes read as nothing', async () => {
    stubApi({ brews: [aBrew()], ai: { flavorTags: [] } });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));

    expect(screen.getByLabelText('Beans')).toHaveValue('Ethiopian Yirgacheffe');
    expect(screen.queryByText('tagged by AI')).not.toBeInTheDocument();
  });
});
