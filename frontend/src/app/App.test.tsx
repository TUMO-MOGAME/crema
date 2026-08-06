import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aBrew, anId, stubApi } from '../test/brew-fixtures';
import { App } from './App';
import { AppProviders } from './providers';

/**
 * The brew log, queried the way someone using it would: by the text on screen
 * and the names of controls, never by class name or component internals. A test
 * that reaches for a CSS class passes for a page nobody can operate.
 */

function renderApp() {
  // Retries off and a fresh cache per test, so no state leaks between cases.
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

describe('the brew list', () => {
  it('shows every brew the API returns', async () => {
    stubApi({ brews: [aBrew(), aBrew({ id: anId(2), beans: 'Kenyan AA' })] });
    renderApp();

    expect(await screen.findByText('Ethiopian Yirgacheffe')).toBeInTheDocument();
    expect(screen.getByText('Kenyan AA')).toBeInTheDocument();
  });

  it('shows the method, doses and ratio for each brew', async () => {
    stubApi({ brews: [aBrew()] });
    renderApp();

    // Waits on the brew itself rather than on the row element. Both arrive at
    // the same moment, but `findByRole('listitem')` also has to not match the
    // skeleton rows, so it only starts succeeding once they are gone — a
    // narrower window, and one that closes under parallel load.
    await screen.findByText('Ethiopian Yirgacheffe');
    const row = screen.getByRole('listitem');

    expect(within(row).getByText('V60')).toBeInTheDocument();
    expect(within(row).getByText('18g')).toBeInTheDocument();
    expect(within(row).getByText('288g')).toBeInTheDocument();
    expect(within(row).getByText('1:16')).toBeInTheDocument();
  });

  it('titles the tab with the brew count, as the brief requires', async () => {
    stubApi({ brews: [aBrew(), aBrew({ id: anId(2) }), aBrew({ id: anId(3) })] });
    renderApp();

    await waitFor(() => expect(document.title).toBe('Brews: 3'));
  });

  it('invites the reader to act when the log is empty', async () => {
    stubApi({ brews: [] });
    renderApp();

    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument();
  });

  it('explains a failure and offers a way to retry', async () => {
    stubApi({ listStatus: 500 });
    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your brews.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('the method filter', () => {
  it('is populated from the API rather than a hardcoded list', async () => {
    stubApi({ brews: [aBrew()] });
    renderApp();

    const filter = await screen.findByLabelText('Filter by method');

    // `find`, because the vocabulary arrives from its own request — asserting
    // synchronously would pass only while the stub happened to be fast.
    expect(await within(filter).findByRole('option', { name: 'Chemex' })).toBeInTheDocument();
    expect(within(filter).getByRole('option', { name: 'Moka pot' })).toBeInTheDocument();
  });

  it('narrows the list to the chosen method', async () => {
    stubApi({
      brews: [aBrew(), aBrew({ id: anId(2), beans: 'Brazilian Santos', method: 'espresso' })],
    });
    const { user } = renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');
    await user.selectOptions(screen.getByLabelText('Filter by method'), 'espresso');

    expect(await screen.findByText('Brazilian Santos')).toBeInTheDocument();
    expect(screen.queryByText('Ethiopian Yirgacheffe')).not.toBeInTheDocument();
  });

  it('offers a way back when a filter matches nothing', async () => {
    stubApi({ brews: [aBrew({ method: 'v60' })] });
    const { user } = renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');
    await user.selectOptions(screen.getByLabelText('Filter by method'), 'chemex');

    expect(await screen.findByText('No brews logged with this method yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all methods' })).toBeInTheDocument();
  });

  it('keeps the tab count on the whole log, not the filtered view', async () => {
    stubApi({
      brews: [aBrew(), aBrew({ id: anId(2), beans: 'Brazilian Santos', method: 'espresso' })],
    });
    const { user } = renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');
    await user.selectOptions(screen.getByLabelText('Filter by method'), 'espresso');
    await screen.findByText('Brazilian Santos');

    // Filtering is a view, not a change to the log.
    await waitFor(() => expect(document.title).toBe('Brews: 2'));
  });
});

describe('adding a brew', () => {
  it('opens an empty form', async () => {
    stubApi({ brews: [] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));

    expect(screen.getByRole('heading', { name: 'Add a brew' })).toBeInTheDocument();
    expect(screen.getByLabelText('Beans')).toHaveValue('');
  });

  it('refuses to submit a blank field, as the brief requires', async () => {
    const { calls } = stubApi({ brews: [] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Beans is required')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('refuses whitespace that only looks like a value', async () => {
    const { calls } = stubApi({ brews: [] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Beans'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Beans is required')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('sends a complete brew to the API', async () => {
    const { calls } = stubApi({ brews: [] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Beans'), 'Kenyan AA');
    await user.selectOptions(screen.getByLabelText('Method'), 'chemex');
    await user.type(screen.getByLabelText('Coffee grams'), '22');
    await user.type(screen.getByLabelText('Water grams'), '352');
    await user.type(screen.getByLabelText('Rating (out of 5)'), '4');
    await user.type(screen.getByLabelText('Tasting notes'), 'Milk chocolate, orange peel');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST');
      expect(post?.body).toMatchObject({
        beans: 'Kenyan AA',
        method: 'chemex',
        coffeeGrams: 22,
        waterGrams: 352,
        rating: 4,
      });
    });
  });

  it('puts an error the API blamed on a field onto that field', async () => {
    stubApi({
      brews: [],
      writeStatus: 422,
      writeBody: {
        error: {
          code: 'SEMANTIC_INVALID',
          message: 'A brew needs more water than coffee.',
          details: [{ field: 'waterGrams', message: 'Water must be greater than coffee' }],
          requestId: 'r1',
        },
      },
    });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Beans'), 'Kenyan AA');
    await user.selectOptions(screen.getByLabelText('Method'), 'chemex');
    await user.type(screen.getByLabelText('Coffee grams'), '300');
    await user.type(screen.getByLabelText('Water grams'), '20');
    await user.type(screen.getByLabelText('Rating (out of 5)'), '4');
    await user.type(screen.getByLabelText('Tasting notes'), 'Wrong way round');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // A rule the client does not know about still lands on the right control.
    expect(await screen.findByText('Water must be greater than coffee')).toBeInTheDocument();
  });
});

describe('editing a brew', () => {
  it('opens with the brew already loaded', async () => {
    stubApi({ brews: [aBrew()] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));

    expect(screen.getByRole('heading', { name: 'Edit a brew' })).toBeInTheDocument();
    expect(screen.getByLabelText('Beans')).toHaveValue('Ethiopian Yirgacheffe');
    expect(screen.getByLabelText('Rating (out of 5)')).toHaveValue(5);
  });

  it('sends the edited brew to the API', async () => {
    const { calls } = stubApi({ brews: [aBrew()] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));
    await user.clear(screen.getByLabelText('Rating (out of 5)'));
    await user.type(screen.getByLabelText('Rating (out of 5)'), '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH');
      // The form submits every field, not a diff — `updateBrewSchema` is
      // partial so a diff would also be valid, but this is what it sends and
      // the test says so. It used to be named for the diff it does not send.
      expect(patch?.body).toMatchObject({ rating: 2, beans: 'Ethiopian Yirgacheffe' });
    });
  });

  it('will not save a field that has been emptied', async () => {
    const { calls } = stubApi({ brews: [aBrew()] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));
    await user.clear(screen.getByLabelText('Beans'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Beans is required')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });
});

describe('deleting a brew', () => {
  /**
   * The confirmation opens on top of the edit form, so both dialogs are in the
   * document. Every assertion is scoped to one of them by its accessible name —
   * which is also what proves each dialog has a distinct one, the thing a
   * screen reader announces on focus.
   */
  const confirmation = () => screen.getByRole('dialog', { name: 'Delete this brew?' });

  async function openDeleteConfirmation() {
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Edit a brew' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    return user;
  }

  it('asks first, and names the brew it would delete', async () => {
    stubApi({ brews: [aBrew()] });
    await openDeleteConfirmation();

    expect(within(confirmation()).getByText('Ethiopian Yirgacheffe')).toBeInTheDocument();
    // "from the app", because the row is soft-deleted rather than removed —
    // the copy is careful not to promise more finality than the schema has.
    expect(within(confirmation()).getByText(/cannot undo this from the app/i)).toBeInTheDocument();
  });

  it('deletes nothing when the confirmation is dismissed', async () => {
    const { calls } = stubApi({ brews: [aBrew()] });
    const user = await openDeleteConfirmation();

    await user.click(within(confirmation()).getByRole('button', { name: 'Cancel' }));

    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('deletes once confirmed', async () => {
    const { calls } = stubApi({ brews: [aBrew()] });
    const user = await openDeleteConfirmation();

    // The confirming button carries the same verb as the one that opened it.
    await user.click(within(confirmation()).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
  });
});

/**
 * `GET /api/brews` used to return the whole log, and the page fetched it twice:
 * once for the rows and once more, unfiltered, only to count them. These cases
 * pin what replaced that — a page at a time, with the count carried in the same
 * response.
 */
describe('paging through a long log', () => {
  /** More brews than fit in one page, each distinguishable by name. */
  function manyBrews(count: number) {
    return Array.from({ length: count }, (_, index) =>
      aBrew({ id: anId(index + 1), beans: `Brew number ${index + 1}` }),
    );
  }

  it('asks for one page rather than the whole log', async () => {
    const { calls } = stubApi({ brews: manyBrews(120) });
    renderApp();

    await screen.findByText('Brew number 1');

    const list = calls.find((call) => call.method === 'GET' && call.url.includes('/api/brews?'));
    expect(list?.url).toContain('limit=50');
  });

  it('shows the first page and offers the rest', async () => {
    stubApi({ brews: manyBrews(120) });
    renderApp();

    await screen.findByText('Brew number 1');

    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.queryByText('Brew number 51')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
    expect(screen.getByText('Showing 50 of 120')).toBeInTheDocument();
  });

  it('appends the next page rather than replacing the current one', async () => {
    stubApi({ brews: manyBrews(120) });
    const { user } = renderApp();

    await screen.findByText('Brew number 1');
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Brew number 51')).toBeInTheDocument();
    // The first page is still there — this is a longer list, not a new one.
    expect(screen.getByText('Brew number 1')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(100);
  });

  it('stops offering more once the whole log is on screen', async () => {
    stubApi({ brews: manyBrews(60) });
    const { user } = renderApp();

    await screen.findByText('Brew number 1');
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    await screen.findByText('Brew number 51');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('counts the whole log in the tab title, not the page on screen', async () => {
    stubApi({ brews: manyBrews(120) });
    renderApp();

    await screen.findByText('Brew number 1');

    // 120, from one page-sized request — not from loading 120 brews to count.
    await waitFor(() => expect(document.title).toBe('Brews: 120'));
  });
});

/**
 * The live region used to wrap the list, so narrowing a filter re-announced
 * every row. It now carries a summary, which is what a reader needs to hear.
 */
describe('what a screen reader is told', () => {
  it('summarises the list instead of reciting it', async () => {
    stubApi({ brews: [aBrew(), aBrew({ id: anId(2), beans: 'Kenyan AA' })] });
    renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('2 brews.');
    // The rows are for navigating, not for announcing.
    expect(status).not.toHaveTextContent('Ethiopian Yirgacheffe');
  });

  it('says how much of a long log is showing', async () => {
    stubApi({
      brews: Array.from({ length: 120 }, (_, index) => aBrew({ id: anId(index + 1) })),
    });
    renderApp();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Showing 50 of 120'));
  });

  it('says when a filter matched nothing', async () => {
    stubApi({ brews: [aBrew({ method: 'v60' })] });
    const { user } = renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');
    await user.selectOptions(screen.getByLabelText('Filter by method'), 'chemex');

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No brews logged with this method.'),
    );
  });
});
