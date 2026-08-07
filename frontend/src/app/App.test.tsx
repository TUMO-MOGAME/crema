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

    expect(await screen.findByRole('alert', { name: /could not load/i })).toBeInTheDocument();
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

    const status = screen.getByRole('status', { name: 'Brew list' });
    expect(status).toHaveTextContent('2 brews.');
    // The rows are for navigating, not for announcing.
    expect(status).not.toHaveTextContent('Ethiopian Yirgacheffe');
  });

  it('says how much of a long log is showing', async () => {
    stubApi({
      brews: Array.from({ length: 120 }, (_, index) => aBrew({ id: anId(index + 1) })),
    });
    renderApp();

    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Brew list' })).toHaveTextContent(
        'Showing 50 of 120',
      ),
    );
  });

  it('says when a filter matched nothing', async () => {
    stubApi({ brews: [aBrew({ method: 'v60' })] });
    const { user } = renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');
    await user.selectOptions(screen.getByLabelText('Filter by method'), 'chemex');

    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Brew list' })).toHaveTextContent(
        'No brews logged with this method.',
      ),
    );
  });
});

/**
 * Optimistic updates, asserted in the window they exist in.
 *
 * Every case here holds the write open, so what is on screen is the guess and
 * not the answer. Without that these would pass against a plain refetch, which
 * is the implementation they replaced.
 */
describe('changes that land before the server agrees', () => {
  async function fillNewBrew(user: ReturnType<typeof userEvent.setup>, beans: string) {
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Beans'), beans);
    await user.selectOptions(screen.getByLabelText('Method'), 'chemex');
    await user.type(screen.getByLabelText('Coffee grams'), '22');
    await user.type(screen.getByLabelText('Water grams'), '352');
    await user.type(screen.getByLabelText('Rating (out of 5)'), '4');
    await user.type(screen.getByLabelText('Tasting notes'), 'Milk chocolate, orange peel');
    await user.click(screen.getByRole('button', { name: 'Save' }));
  }

  it('shows a new brew while the request is still open', async () => {
    stubApi({ brews: [aBrew()], holdWrites: true });
    const { user } = renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');
    await fillNewBrew(user, 'Rwandan Nyungwe');

    // The server has not answered and will not until released.
    expect(await screen.findByText('Rwandan Nyungwe')).toBeInTheDocument();
  });

  it('counts it immediately too, not just shows it', async () => {
    stubApi({ brews: [aBrew()], holdWrites: true });
    const { user } = renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');
    await waitFor(() => expect(document.title).toBe('Brews: 1'));

    await fillNewBrew(user, 'Rwandan Nyungwe');

    // The count lives on every page of the cache; a patch that updated only
    // the page it inserted into would leave this at 1.
    await waitFor(() => expect(document.title).toBe('Brews: 2'));
  });

  it('takes the brew back off when the server refuses it', async () => {
    const { releaseWrites } = stubApi({ brews: [aBrew()], holdWrites: true, writeStatus: 500 });
    const { user } = renderApp();

    await screen.findByText('Ethiopian Yirgacheffe');
    await fillNewBrew(user, 'Rwandan Nyungwe');

    expect(await screen.findByText('Rwandan Nyungwe')).toBeInTheDocument();

    releaseWrites();

    await waitFor(() => expect(screen.queryByText('Rwandan Nyungwe')).not.toBeInTheDocument());
    // And the count goes back with it.
    await waitFor(() => expect(document.title).toBe('Brews: 1'));
  });

  it('removes a deleted brew before the server confirms', async () => {
    stubApi({ brews: [aBrew(), aBrew({ id: anId(2), beans: 'Kenyan AA' })], holdWrites: true });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Kenyan AA' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Edit a brew' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this brew?' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    // Scoped to the row, not the document: the confirmation is still open and
    // still names the brew, because the request it is waiting on is held.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Kenyan AA' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(document.title).toBe('Brews: 1'));
  });

  it('puts a deleted brew back when the delete fails', async () => {
    const { releaseWrites } = stubApi({
      brews: [aBrew(), aBrew({ id: anId(2), beans: 'Kenyan AA' })],
      holdWrites: true,
      writeStatus: 500,
    });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Kenyan AA' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Edit a brew' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this brew?' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Kenyan AA' })).not.toBeInTheDocument(),
    );

    releaseWrites();

    // A brew that is still there has to come back, or the reader is told it is
    // gone by an interface that never asked the server successfully.
    expect(await screen.findByRole('heading', { name: 'Kenyan AA' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Brews: 2'));
  });

  it('shows an edit before it is saved', async () => {
    stubApi({ brews: [aBrew()], holdWrites: true });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));
    await user.clear(screen.getByLabelText('Beans'));
    await user.type(screen.getByLabelText('Beans'), 'Renamed beans');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Renamed beans')).toBeInTheDocument();
  });

  it('restores the old values when an edit is refused', async () => {
    const { releaseWrites } = stubApi({ brews: [aBrew()], holdWrites: true, writeStatus: 500 });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));
    await user.clear(screen.getByLabelText('Beans'));
    await user.type(screen.getByLabelText('Beans'), 'Renamed beans');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Renamed beans');

    releaseWrites();

    expect(await screen.findByText('Ethiopian Yirgacheffe')).toBeInTheDocument();
    expect(screen.queryByText('Renamed beans')).not.toBeInTheDocument();
  });
});

/**
 * What the interface says after the fact.
 *
 * Toasts exist here because optimism needs them: a change that was applied and
 * then undone has to account for itself, or a row appears to vanish and return
 * on its own.
 */
describe('telling the reader what happened', () => {
  /** Opens the edit dialog for the seeded brew and confirms the delete. */
  async function deleteTheBrew(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Edit Ethiopian Yirgacheffe' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Edit a brew' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this brew?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
  }

  it('confirms a brew was added', async () => {
    stubApi({ brews: [] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Beans'), 'Kenyan AA');
    await user.selectOptions(screen.getByLabelText('Method'), 'chemex');
    await user.type(screen.getByLabelText('Coffee grams'), '22');
    await user.type(screen.getByLabelText('Water grams'), '352');
    await user.type(screen.getByLabelText('Rating (out of 5)'), '4');
    await user.type(screen.getByLabelText('Tasting notes'), 'Milk chocolate');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const notifications = screen.getByRole('status', { name: 'Notifications' });
    await waitFor(() => expect(notifications).toHaveTextContent('Brew added.'));
  });

  it('says nothing in a toast when the form already said it', async () => {
    // A field error is rendered on the field. Repeating it in a toast would be
    // one failure described twice, in two places, at the same moment.
    stubApi({ brews: [] });
    const { user } = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Beans is required');
    expect(screen.getByRole('status', { name: 'Notifications' })).toBeEmptyDOMElement();
  });

  it('explains a delete that failed, in the assertive region', async () => {
    stubApi({ brews: [aBrew()], writeStatus: 500 });
    const { user } = renderApp();

    await deleteTheBrew(user);

    // Assertive, not polite: the row just came back on screen and the reader
    // needs to know why before they try again.
    const errors = screen.getByRole('alert', { name: 'Errors' });
    await waitFor(() => expect(errors).toHaveTextContent(/could not delete/i));
  });

  it('names the brew it is talking about', async () => {
    stubApi({ brews: [aBrew()] });
    const { user } = renderApp();

    await deleteTheBrew(user);

    const notifications = screen.getByRole('status', { name: 'Notifications' });
    await waitFor(() => expect(notifications).toHaveTextContent('Ethiopian Yirgacheffe deleted.'));
  });

  it('can be dismissed before it expires', async () => {
    stubApi({ brews: [aBrew()] });
    const { user } = renderApp();

    await deleteTheBrew(user);
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(screen.getByRole('status', { name: 'Notifications' })).toBeEmptyDOMElement();
  });
});
