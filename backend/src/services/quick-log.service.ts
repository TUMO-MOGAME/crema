import type { BrewProposal } from '@crema/shared';
import type { AiProvider } from '../ai/index.js';
import { AppError } from '../lib/app-error.js';

/**
 * Turning a sentence into a brew the user can confirm.
 *
 * Thin on purpose. The reading is the provider's job and the status codes are
 * the route's, which leaves this layer with the two things that belong to
 * neither: deciding what "the AI is not configured here" means, and recording
 * what the call cost.
 *
 * The provider is nullable because a deployment without a key is a supported
 * configuration rather than a broken one. Holding the null here — instead of
 * letting the route ask the environment — means there is one answer to "is the
 * AI on", and it is the same object the call would have gone to.
 */
export class QuickLogService {
  readonly #provider: AiProvider | null;

  constructor(provider: AiProvider | null) {
    this.#provider = provider;
  }

  /** What `/api/health` reports, from the same source the call would use. */
  get available(): boolean {
    return this.#provider !== null;
  }

  async propose(text: string, options: { signal?: AbortSignal; requestId?: string } = {}) {
    // A 503 rather than a 500: nothing is broken, the feature is absent. The
    // frontend hides the surface when health says so, and this is the answer
    // for the client that asks anyway.
    if (!this.#provider) throw AppError.aiUnavailable();

    const started = Date.now();

    // Built conditionally rather than as `{ signal: options.signal }`, because
    // `exactOptionalPropertyTypes` draws a distinction the shorthand erases: an
    // absent signal and a signal explicitly set to undefined are not the same
    // value, and only the first is what the interface offers.
    const call = options.signal ? { signal: options.signal } : {};
    const { proposal, usage } = await this.#provider.proposeBrew(text, call);

    // Per request, because a monthly total tells you something is expensive and
    // never which thing. Structured for the same reason the error log is: these
    // lines are read by a query far more often than by a person.
    //
    // The sentence itself is deliberately not logged. It is the user's writing,
    // it is not needed to answer a question about cost, and a log that quietly
    // accumulates what people typed is a liability rather than an asset. Its
    // length is enough to correlate a spike with an unusual input.
    // `info` rather than one of the two levels the lint rule allows. A
    // successful call is not a warning and not an error, and logging it as
    // either would put routine cost accounting into the stream that is supposed
    // to mean something went wrong.
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'ai.quick_log',
        requestId: options.requestId,
        provider: this.#provider.name,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        promptChars: text.length,
        fieldsProposed: Object.keys(proposal.brew).length,
        fieldsInferred: proposal.inferred.length,
        durationMs: Date.now() - started,
      }),
    );

    return proposal satisfies BrewProposal;
  }
}
