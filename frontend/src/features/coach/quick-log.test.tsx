import type { BrewProposal } from '@crema/shared';
import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { AppProviders } from '../../app/providers';
import { aBrew, stubApi } from '../../test/brew-fixtures';

/**
 * Quick Log, driven the way someone would use it: type a sentence, press
 * Pre-fill, check what landed in the form. The design position under test is
 * the human staying in the loop — a proposal fills controls and marks its
 * guesses, and nothing reaches `POST /api/brews` until Save.
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

/** A full proposal, with one field the model guessed rather than was told. */
const A_PROPOSAL = {
  brew: {
    beans: 'Ethiopian Yirgacheffe',
    method: 'v60',
    coffeeGrams: 18,
    waterGrams: 288,
    rating: 4,
    tastingNotes: 'Blackcurrant and tea',
  },
  inferred: ['waterGrams'],
} satisfies BrewProposal;

async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Add' }));
}

describe('the quick log panel', () => {
  it('does not render on a deployment whose health reports the AI disabled', async () => {
    stubApi({ brews: [] });
    const { user } = renderApp();

    await openAddForm(user);

    expect(screen.getByRole('heading', { name: 'Add a brew' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Say it in a sentence')).not.toBeInTheDocument();
  });

  it('renders in the add form when health reports the AI available', async () => {
    stubApi({ brews: [], ai: { proposal: A_PROPOSAL } });
    const { user } = renderApp();

    await openAddForm(user);
    expect(await screen.findByLabelText('Say it in a sentence')).toBeInTheDocument();
  });

  it('stays out of the edit form — a confirmed brew is not its to rewrite', async () => {
    stubApi({ brews: [aBrew()], ai: { proposal: A_PROPOSAL } });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));

    expect(screen.getByRole('heading', { name: 'Edit a brew' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Say it in a sentence')).not.toBeInTheDocument();
  });

  it('pre-fills the form from a sentence and marks what the model inferred', async () => {
    stubApi({ brews: [], ai: { proposal: A_PROPOSAL } });
    const { user } = renderApp();

    await openAddForm(user);
    await user.type(
      await screen.findByLabelText('Say it in a sentence'),
      '18g of the Ethiopian through the V60, tasted of blackcurrant, solid 4',
    );
    await user.click(screen.getByRole('button', { name: 'Pre-fill' }));

    expect(await screen.findByText(/filled from your sentence/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Beans')).toHaveValue('Ethiopian Yirgacheffe');
    expect(screen.getByLabelText('Method')).toHaveValue('v60');
    expect(screen.getByLabelText('Coffee grams')).toHaveValue(18);
    expect(screen.getByLabelText('Water grams')).toHaveValue(288);
    expect(screen.getByLabelText('Rating (out of 5)')).toHaveValue(4);
    expect(screen.getByLabelText('Tasting notes')).toHaveValue('Blackcurrant and tea');

    // Only the guessed field wears the mark, and a reader on the control hears
    // it — the chip is part of the input's accessible description, not just a
    // colour beside it.
    expect(screen.getAllByText('inferred')).toHaveLength(1);
    expect(screen.getByLabelText('Water grams')).toHaveAccessibleDescription('inferred');
  });

  it('drops the mark the moment the reader edits the guessed field', async () => {
    stubApi({ brews: [], ai: { proposal: A_PROPOSAL } });
    const { user } = renderApp();

    await openAddForm(user);
    await user.type(await screen.findByLabelText('Say it in a sentence'), '18g V60');
    await user.click(screen.getByRole('button', { name: 'Pre-fill' }));
    await screen.findByText(/filled from your sentence/i);

    await user.clear(screen.getByLabelText('Water grams'));
    await user.type(screen.getByLabelText('Water grams'), '300');

    expect(screen.queryByText('inferred')).not.toBeInTheDocument();
  });

  it('writes nothing until the human presses Save', async () => {
    const { calls } = stubApi({ brews: [], ai: { proposal: A_PROPOSAL } });
    const { user } = renderApp();

    await openAddForm(user);
    await user.type(await screen.findByLabelText('Say it in a sentence'), '18g V60, 288 water');
    await user.click(screen.getByRole('button', { name: 'Pre-fill' }));
    await screen.findByText(/filled from your sentence/i);

    expect(calls.some((call) => call.url.includes('/api/brews') && call.method === 'POST')).toBe(
      false,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Brew added.')).toBeInTheDocument();
    const post = calls.find((call) => call.url.includes('/api/brews') && call.method === 'POST');
    expect(post?.body).toMatchObject({ beans: 'Ethiopian Yirgacheffe', waterGrams: 288 });
  });

  it('says so when the sentence contained no brew, without failing', async () => {
    stubApi({ brews: [], ai: { proposal: { brew: {}, inferred: [] } } });
    const { user } = renderApp();

    await openAddForm(user);
    await user.type(await screen.findByLabelText('Say it in a sentence'), 'good morning');
    await user.click(screen.getByRole('button', { name: 'Pre-fill' }));

    expect(await screen.findByText(/nothing in that read as a brew/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Beans')).toHaveValue('');
  });

  it('shows the failure where the sentence was typed', async () => {
    stubApi({
      brews: [],
      ai: { status: 429, message: 'Too many requests. Try again in a minute.' },
    });
    const { user } = renderApp();

    await openAddForm(user);
    await user.type(await screen.findByLabelText('Say it in a sentence'), '18g V60');
    await user.click(screen.getByRole('button', { name: 'Pre-fill' }));

    expect(
      await screen.findByText('Too many requests. Try again in a minute.'),
    ).toBeInTheDocument();
  });

  it('keeps what the reader already typed when the proposal is missing it', async () => {
    stubApi({
      brews: [],
      ai: { proposal: { brew: { method: 'v60', coffeeGrams: 18 }, inferred: [] } },
    });
    const { user } = renderApp();

    await openAddForm(user);
    await user.type(screen.getByLabelText('Beans'), 'Kenyan AA');
    await user.type(await screen.findByLabelText('Say it in a sentence'), '18g through the V60');
    await user.click(screen.getByRole('button', { name: 'Pre-fill' }));
    await screen.findByText(/filled from your sentence/i);

    expect(screen.getByLabelText('Beans')).toHaveValue('Kenyan AA');
    expect(screen.getByLabelText('Method')).toHaveValue('v60');
  });

  it('sends the sentence over Enter as well as the button, without submitting the form', async () => {
    const { calls } = stubApi({ brews: [], ai: { proposal: A_PROPOSAL } });
    const { user } = renderApp();

    await openAddForm(user);
    await user.type(
      await screen.findByLabelText('Say it in a sentence'),
      '18g V60, 288 water{Enter}',
    );

    expect(await screen.findByText(/filled from your sentence/i)).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes('/api/brews') && call.method === 'POST')).toBe(
      false,
    );
  });
});
