import type { AiCallOptions, AiProvider, CoachAnswerEvent, CoachTools } from '../ai/index.js';
import { createCoachTools } from '../ai/coach-tools.js';
import { AppError } from '../lib/app-error.js';
import type { BrewRepository } from '../repositories/brew.repository.js';

/**
 * One question to the coach, answered as a stream of events.
 *
 * The same shape as `QuickLogService` for the same reasons: the provider is
 * nullable because a deployment without a key is a configuration rather than a
 * failure, and the cost of the call is logged here because neither the provider
 * nor the route owns accounting.
 *
 * `ask` is deliberately not an async generator itself. The availability check
 * has to throw *before* the route commits to a streamed response — a generator
 * defers its body until the first pull, which lands the 503 after the 200 has
 * already gone out. Splitting "may I" from "go" keeps the status code honest.
 */
export class CoachService {
  readonly #provider: AiProvider | null;
  readonly #tools: CoachTools;

  constructor(provider: AiProvider | null, repository: BrewRepository) {
    this.#provider = provider;
    this.#tools = createCoachTools(repository);
  }

  /** What `/api/health` reports, from the same source the call would use. */
  get available(): boolean {
    return this.#provider !== null;
  }

  ask(
    question: string,
    options: { signal?: AbortSignal; requestId?: string } = {},
  ): AsyncIterable<CoachAnswerEvent> {
    if (!this.#provider) throw AppError.aiUnavailable();

    return this.#stream(this.#provider, question, options);
  }

  async *#stream(
    provider: AiProvider,
    question: string,
    options: { signal?: AbortSignal; requestId?: string },
  ): AsyncGenerator<CoachAnswerEvent> {
    const started = Date.now();

    // Conditional for the same `exactOptionalPropertyTypes` reason as
    // `QuickLogService`: an absent signal and an undefined one differ.
    const call: AiCallOptions = options.signal ? { signal: options.signal } : {};

    for await (const event of provider.coach(question, this.#tools, call)) {
      // The `done` event is the natural place to account for the run: it is
      // the one event that exists exactly once and carries the usage. The
      // question itself is not logged, for the same reason the quick-log
      // sentence is not — its length answers every cost question a log line
      // will ever be asked.
      if (event.type === 'done') {
        // eslint-disable-next-line no-console
        console.info(
          JSON.stringify({
            level: 'info',
            event: 'ai.coach',
            requestId: options.requestId,
            provider: provider.name,
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens,
            toolCalls: event.toolCalls,
            questionChars: question.length,
            durationMs: Date.now() - started,
          }),
        );
      }

      yield event;
    }
  }
}
