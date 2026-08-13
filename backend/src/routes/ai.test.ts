import {
  AI_LIMITS,
  brewFlavorTagListSchema,
  brewPageSchema,
  brewProposalSchema,
  coachEventSchema,
  isApiErrorBody,
  type ApiErrorBody,
  type CoachEvent,
} from '@crema/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiProvider } from '../ai/index.js';
import { FakeAiProvider } from '../ai/fake-ai-provider.js';
import { createApp } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { InMemoryBrewRepository } from '../repositories/in-memory-brew.repository.js';

/**
 * `POST /api/ai/quick-log`, over the real app and without a model.
 *
 * Every one of these runs the whole stack — rate limit, body limit, validation,
 * service, error handler — with the deterministic fake standing in for Gemini.
 * That is the entire argument for the provider seam: the route's behaviour is
 * asserted on every pull request, in milliseconds, with no key and no bill.
 */

const CANONICAL = '18g of the Ethiopian through the V60, 300 water, blackcurrant, solid 4';

function appWith(ai: AiProvider | null) {
  return createApp({ brews: new InMemoryBrewRepository(), ai });
}

function post(app: ReturnType<typeof createApp>, body: unknown) {
  return app.request('/api/ai/quick-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** A provider that always fails the way an unreadable answer fails. */
const unreadable: AiProvider = {
  name: 'always-fails',
  proposeBrew: () => Promise.reject(AppError.aiParseFailed()),
  coach: () => {
    throw AppError.aiParseFailed();
  },
  extractFlavorTags: () => Promise.reject(AppError.aiParseFailed()),
};

/** A provider that gets one sentence out and then dies mid-answer. */
const midStreamFailure: AiProvider = {
  name: 'dies-mid-answer',
  proposeBrew: () => Promise.reject(AppError.aiParseFailed()),
  // eslint-disable-next-line @typescript-eslint/require-await
  coach: async function* () {
    yield { type: 'text', delta: 'Your best brews ' } as const;
    throw new Error('socket closed: the model quoted "18g of the Ethiopian" back');
  },
  extractFlavorTags: () => Promise.reject(AppError.aiParseFailed()),
};

function postCoach(app: ReturnType<typeof createApp>, body: unknown) {
  return app.request('/api/ai/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** SSE, parsed back into the events the schema shares with the frontend. */
async function readEvents(response: Response): Promise<CoachEvent[]> {
  const raw = await response.text();

  return raw
    .split('\n\n')
    .map((block) => /^data: (.+)$/m.exec(block)?.[1])
    .filter((data): data is string => data !== undefined)
    .map((data) => coachEventSchema.parse(JSON.parse(data)));
}

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  app = appWith(new FakeAiProvider());
});

describe('POST /api/ai/quick-log', () => {
  it('answers 200 with a proposal the shared contract accepts', async () => {
    const response = await post(app, { text: CANONICAL });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(() => brewProposalSchema.parse(body)).not.toThrow();
  });

  it('reads the sentence rather than echoing it', async () => {
    const response = await post(app, { text: CANONICAL });
    const proposal = brewProposalSchema.parse(await response.json());

    expect(proposal.brew.coffeeGrams).toBe(18);
    expect(proposal.brew.waterGrams).toBe(300);
    expect(proposal.brew.method).toBe('v60');
    expect(proposal.brew.rating).toBe(4);
  });

  it('is a 200 and not a 201, because nothing was created', async () => {
    const response = await post(app, { text: CANONICAL });

    // The proposal is a candidate. Only POST /api/brews creates anything, and
    // a Location header here would say otherwise.
    expect(response.status).toBe(200);
    expect(response.headers.get('Location')).toBeNull();
  });

  it('does not write the proposed brew to the log', async () => {
    await post(app, { text: CANONICAL });

    const page = brewPageSchema.parse(await (await app.request('/api/brews')).json());
    expect(page.total).toBe(0);
  });

  describe('rejects what it should', () => {
    it('answers 400 for a blank sentence', async () => {
      const response = await post(app, { text: '   ' });
      const body = (await response.json()) as ApiErrorBody;

      expect(response.status).toBe(400);
      expect(isApiErrorBody(body)).toBe(true);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.details?.[0]?.field).toBe('text');
    });

    it('answers 400 for a sentence past the cap', async () => {
      const response = await post(app, { text: 'a'.repeat(AI_LIMITS.quickLogMaxLength + 1) });

      expect(response.status).toBe(400);
    });

    it('answers 400 for malformed JSON', async () => {
      const response = await post(app, '{"text": ');

      expect(response.status).toBe(400);
    });

    it('answers 400 for unknown keys rather than ignoring them', async () => {
      // The model is a deployment decision, not a request parameter. Accepting
      // and ignoring it would read as support for choosing one.
      const response = await post(app, { text: CANONICAL, model: 'something-else' });

      expect(response.status).toBe(400);
    });

    it('answers 413 for a body past the limit', async () => {
      const response = await post(app, { text: 'a'.repeat(17 * 1024) });

      expect(response.status).toBe(413);
    });
  });

  describe('when the deployment has no key', () => {
    it('answers 503 with a code the frontend can act on', async () => {
      const response = await post(appWith(null), { text: CANONICAL });
      const body = (await response.json()) as ApiErrorBody;

      expect(response.status).toBe(503);
      expect(body.error.code).toBe('AI_UNAVAILABLE');
    });

    it('leaves every other route working', async () => {
      const noAi = appWith(null);

      expect((await noAi.request('/api/brews')).status).toBe(200);
      expect((await noAi.request('/api/brew-methods')).status).toBe(200);
      expect((await noAi.request('/api/stats')).status).toBe(200);
      expect((await noAi.request('/api/health')).status).toBe(200);
    });
  });

  describe('when the model cannot read the sentence', () => {
    it('answers 422 rather than 500, because nothing is broken', async () => {
      const response = await post(appWith(unreadable), { text: CANONICAL });
      const body = (await response.json()) as ApiErrorBody;

      expect(response.status).toBe(422);
      expect(body.error.code).toBe('AI_PARSE_FAILED');
    });

    it('answers with a message written here, not by the model', async () => {
      const response = await post(appWith(unreadable), { text: CANONICAL });
      const body = (await response.json()) as ApiErrorBody;

      // Model output can contain whatever was typed into it, so none of it is
      // echoed. The message is ours and says what to do next.
      expect(body.error.message).toMatch(/describing the coffee/i);
    });
  });

  describe('cost', () => {
    it('logs what the call spent, without logging what was typed', async () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

      await post(app, { text: CANONICAL });

      const line = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
      expect(line.event).toBe('ai.quick_log');
      expect(line.provider).toBe('fake');
      expect(line.inputTokens).toBeGreaterThan(0);
      expect(line.promptChars).toBe(CANONICAL.length);

      // The sentence is the user's writing and is not needed to answer a
      // question about cost.
      expect(JSON.stringify(line)).not.toContain('Ethiopian');
    });
  });

  describe('rate limiting', () => {
    it('answers 429 with a Retry-After once the AI budget is spent', async () => {
      // Far tighter than the general limit, because each of these costs a model
      // call rather than a map lookup.
      const responses: Response[] = [];
      for (let i = 0; i < 12; i++) {
        responses.push(await post(app, { text: CANONICAL }));
      }

      const limited = responses.filter((r) => r.status === 429);
      expect(limited.length).toBeGreaterThan(0);
      expect(limited[0]?.headers.get('Retry-After')).toMatch(/^\d+$/);
    });

    it('does not spend the budget the brew routes are using', async () => {
      for (let i = 0; i < 12; i++) await post(app, { text: CANONICAL });

      expect((await app.request('/api/brews')).status).toBe(200);
    });
  });
});

describe('POST /api/ai/coach', () => {
  it('streams an answer as events the shared contract accepts', async () => {
    const response = await postCoach(app, { question: 'What ratio gives me my best brews?' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    // `readEvents` parses every event against `coachEventSchema`, so reaching
    // the assertions below already proves the stream speaks the contract.
    const events = await readEvents(response);

    expect(events.filter((event) => event.type === 'tool-call').length).toBeGreaterThan(0);
    expect(events.filter((event) => event.type === 'text').length).toBeGreaterThan(0);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('answers 503 before streaming when the deployment has no key', async () => {
    // The availability check runs before the stream opens, so this is a real
    // status code the client can branch on — not an error event inside a 200.
    const response = await postCoach(appWith(null), { question: 'Anything?' });
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('AI_UNAVAILABLE');
  });

  it('answers 400 for a blank question', async () => {
    const response = await postCoach(app, { question: '   ' });
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.details?.[0]?.field).toBe('question');
  });

  it('answers 400 for a question past the cap', async () => {
    const response = await postCoach(app, {
      question: 'a'.repeat(AI_LIMITS.coachQuestionMaxLength + 1),
    });

    expect(response.status).toBe(400);
  });

  it('turns a mid-answer failure into a final error event, in our words', async () => {
    const response = await postCoach(appWith(midStreamFailure), { question: 'Best ratio?' });
    const events = await readEvents(response);
    const last = events.at(-1);

    if (last?.type !== 'error') throw new Error('The stream did not end with an error event.');

    expect(last.code).toBe('INTERNAL_ERROR');
    // The thrown message quoted the user's input; the event must not carry it.
    expect(last.message).not.toContain('Ethiopian');
    expect(last.message).toMatch(/ask again/i);
  });

  it('logs what the run cost, without logging the question', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const question = 'Why are my Aeropress brews worse than my pour-overs?';

    await readEvents(await postCoach(app, { question }));

    const line = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line.event).toBe('ai.coach');
    expect(line.provider).toBe('fake');
    expect(line.questionChars).toBe(question.length);
    expect(JSON.stringify(line)).not.toContain('Aeropress');
  });

  it('shares the AI budget with quick-log rather than holding its own', async () => {
    const responses: Response[] = [];
    for (let i = 0; i < 12; i++) {
      responses.push(await postCoach(app, { question: 'Best ratio?' }));
    }

    expect(responses.some((response) => response.status === 429)).toBe(true);
  });
});

describe('POST /api/ai/flavor-tags', () => {
  /** The app with one brew already in it, so the tests can name a real id. */
  async function appWithABrew() {
    const repository = new InMemoryBrewRepository([
      {
        beans: 'Ethiopian Yirgacheffe',
        method: 'v60',
        coffeeGrams: 18,
        waterGrams: 288,
        rating: 5,
        tastingNotes: 'Blackcurrant, jasmine, tea-like and clean',
      },
    ]);
    const built = createApp({ brews: repository, ai: new FakeAiProvider() });
    const page = brewPageSchema.parse(await (await built.request('/api/brews')).json());
    const id = page.brews[0]?.id;
    if (!id) throw new Error('The seeded brew has no id.');

    return { app: built, id };
  }

  function postTags(target: ReturnType<typeof createApp>, body: unknown) {
    return target.request('/api/ai/flavor-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('reads the saved notes and stores tags with AI provenance', async () => {
    const { app: target, id } = await appWithABrew();

    const response = await postTags(target, { brewId: id });
    const tags = brewFlavorTagListSchema.parse(await response.json());

    expect(response.status).toBe(200);
    // Blackcurrant is a berry and jasmine is a flower; both carry provenance.
    expect(tags.map((tag) => tag.slug)).toContain('berry');
    expect(tags.map((tag) => tag.slug)).toContain('floral');
    expect(tags.every((tag) => tag.source === 'ai')).toBe(true);
    expect(tags.every((tag) => tag.confidence !== null)).toBe(true);
  });

  it('serves the stored tags back from the brew route', async () => {
    const { app: target, id } = await appWithABrew();
    await postTags(target, { brewId: id });

    const response = await target.request(`/api/brews/${id}/flavor-tags`);
    const tags = brewFlavorTagListSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(tags.length).toBeGreaterThan(0);
  });

  it('answers 404 for a brew that does not exist', async () => {
    const { app: target } = await appWithABrew();

    const response = await postTags(target, {
      brewId: '11111111-1111-4111-8111-000000000099',
    });

    expect(response.status).toBe(404);
  });

  it('answers 400 for a body that names no brew', async () => {
    const { app: target } = await appWithABrew();

    expect((await postTags(target, {})).status).toBe(400);
    expect((await postTags(target, { brewId: 'not-a-uuid' })).status).toBe(400);
  });

  it('answers 503 when the deployment has no key, and loses no brews doing it', async () => {
    const noAi = appWith(null);

    const response = await noAi.request('/api/ai/flavor-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brewId: '11111111-1111-4111-8111-000000000001' }),
    });

    expect(response.status).toBe(503);
    expect((await noAi.request('/api/brews')).status).toBe(200);
  });
});

describe('GET /api/health', () => {
  it('reports the AI as enabled when a provider is wired', async () => {
    const body = (await (await app.request('/api/health')).json()) as {
      ai: { enabled: boolean; model: string | null };
    };

    expect(body.ai.enabled).toBe(true);
    expect(body.ai.model).not.toBeNull();
  });

  it('reports the AI as absent when none is, whatever the environment says', async () => {
    // The check that matters. A machine with GEMINI_API_KEY set could build an
    // app with no provider — asking the environment would answer "enabled"
    // while every call returned 503, and the frontend would render a surface
    // that cannot work.
    const body = (await (await appWith(null).request('/api/health')).json()) as {
      ai: { enabled: boolean; model: string | null };
    };

    expect(body.ai.enabled).toBe(false);
    expect(body.ai.model).toBeNull();
  });
});
