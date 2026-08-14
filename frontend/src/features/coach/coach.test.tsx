import type { CoachEvent } from '@crema/shared';
import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { AppProviders } from '../../app/providers';
import { stubApi } from '../../test/brew-fixtures';

/**
 * The Brew Coach panel, driven as a person would: open it, ask, watch the
 * answer arrive with the agent's work listed beside it. The stub answers with
 * real SSE bytes, so the client's stream parsing is under test — not a mock of
 * it.
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

/** A full answer: two tool reads, streamed text, a proposal, and the bill. */
const AN_ANSWER: CoachEvent[] = [
  { type: 'tool-call', tool: 'getBrewStats', summary: 'Read the stats: 4 brews.' },
  { type: 'tool-call', tool: 'listBrews', summary: 'Read 3 of 3 matching brews (v60).' },
  { type: 'text', delta: 'Your best V60s sit ' },
  { type: 'text', delta: 'around 1:16.' },
  {
    type: 'proposal',
    proposal: { brew: { method: 'v60', coffeeGrams: 18, waterGrams: 288 }, inferred: ['method'] },
  },
  { type: 'done', usage: { inputTokens: 200, outputTokens: 60 }, toolCalls: 2 },
];

async function askCoach(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.click(await screen.findByRole('button', { name: 'Coach' }));
  await user.type(screen.getByLabelText('Ask about your log'), question);
  await user.click(screen.getByRole('button', { name: 'Ask' }));
}

describe('the brew coach', () => {
  it('offers no coach on a deployment whose health reports the AI disabled', async () => {
    stubApi({ brews: [] });
    renderApp();

    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coach' })).not.toBeInTheDocument();
  });

  it('streams the answer and shows every tool call the agent made', async () => {
    stubApi({ brews: [], ai: { coach: AN_ANSWER } });
    const { user } = renderApp();

    await askCoach(user, 'What ratio gives me my best V60s?');

    expect(await screen.findByText('Your best V60s sit around 1:16.')).toBeInTheDocument();
    expect(screen.getByText('Read the stats: 4 brews.')).toBeInTheDocument();
    expect(screen.getByText('Read 3 of 3 matching brews (v60).')).toBeInTheDocument();
    expect(screen.getByText(/what the coach looked at \(2\)/i)).toBeInTheDocument();

    // The done event's usage is on screen — cost visibility is a guardrail
    // the plan promises, not a log line.
    expect(await screen.findByText('Answered from your log — 260 tokens.')).toBeInTheDocument();
  });

  it('renders the model’s markdown instead of its asterisks', async () => {
    // The bold marker split across two deltas, the way a stream actually
    // delivers it — the renderer sees the pair only once both have landed.
    stubApi({
      brews: [],
      ai: {
        coach: [
          { type: 'text', delta: 'Your best ratio is **1:' },
          { type: 'text', delta: '16**, rated 5/5.' },
          { type: 'done', usage: { inputTokens: 100, outputTokens: 60 }, toolCalls: 0 },
        ],
      },
    });
    const { user } = renderApp();

    await askCoach(user, 'Best ratio?');
    await screen.findByText('Answered from your log — 160 tokens.');

    expect(screen.getByText('1:16').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('hands a proposal to the Add form rather than saving it', async () => {
    const { calls } = stubApi({ brews: [], ai: { coach: AN_ANSWER } });
    const { user } = renderApp();

    await askCoach(user, 'What should I brew tomorrow?');
    await user.click(await screen.findByRole('button', { name: 'Open in Add form' }));

    // The coach dialog closed and the Add form opened on the candidate.
    expect(screen.getByRole('heading', { name: 'Add a brew' })).toBeInTheDocument();
    expect(screen.getByLabelText('Method')).toHaveValue('v60');
    expect(screen.getByLabelText('Coffee grams')).toHaveValue(18);
    expect(screen.getByLabelText('Water grams')).toHaveValue(288);

    // The guessed field is marked, exactly as a quick-log guess would be.
    expect(screen.getByLabelText('Method')).toHaveAccessibleDescription('inferred');

    // And nothing was written on the way.
    expect(calls.some((call) => call.url.includes('/api/brews') && call.method === 'POST')).toBe(
      false,
    );
  });

  it('shows a failure in the panel when the budget is spent', async () => {
    stubApi({ brews: [], ai: { status: 429, message: 'Too many requests. Try again in a minute.' } }); // prettier-ignore
    const { user } = renderApp();

    await askCoach(user, 'Best ratio?');

    expect(
      await screen.findByText('Too many requests. Try again in a minute.'),
    ).toBeInTheDocument();
  });

  it('keeps the partial answer when the stream dies mid-sentence', async () => {
    stubApi({
      brews: [],
      ai: {
        coach: [
          { type: 'text', delta: 'Your best brews ' },
          { type: 'error', code: 'INTERNAL_ERROR', message: 'The coach failed mid-answer. Ask again.' }, // prettier-ignore
        ],
      },
    });
    const { user } = renderApp();

    await askCoach(user, 'Best ratio?');

    expect(await screen.findByText('The coach failed mid-answer. Ask again.')).toBeInTheDocument();
    expect(screen.getByText('Your best brews')).toBeInTheDocument();
  });
});
