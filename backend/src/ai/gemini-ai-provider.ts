import {
  BREW_FIELDS,
  BREW_METHOD_SLUGS,
  brewProposalSchema,
  createBrewSchema,
  type BrewField,
} from '@crema/shared';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import { AppError } from '../lib/app-error';
import type { AiCallOptions, AiProvider, BrewProposalResult } from './ai-provider';

/**
 * The real provider: Gemini, through the Vercel AI SDK.
 *
 * Everything model-shaped lives in this file and nowhere else. The prompt, the
 * schema the model is asked for, the thinking budget, the timeout and the
 * mapping from a model's answer to a `BrewProposal` all stop at this boundary,
 * which is what lets the service and the route above it be tested against the
 * fake without knowing Gemini exists.
 *
 * It is held to `ai-provider.contract.ts` — the same suite the fake passes,
 * written before this file existed. That is the point of having written it
 * first: the questions "does the adapter work" and "does it agree with the fake
 * about what working means" have the same answer.
 */

/**
 * How long a single Quick Log call may take before it is abandoned.
 *
 * Chosen from measurement rather than taste. Typical calls return in 1.8 to 5
 * seconds, but the tail is long and not input-dependent: the same sentence
 * came back in 2.0s on one attempt and 15.9s on the next. A 15 second ceiling
 * therefore cut inside the range the API actually produces, failing calls that
 * were going to succeed — the worst kind of timeout, because it looks like a
 * broken feature rather than a slow one.
 *
 * This still bounds the call, which is the point: a hung request must not keep
 * a serverless function alive until the platform kills it, billing for the
 * whole wait. It is a ceiling on the pathological case, not a latency target.
 */
const TIMEOUT_MS = 30_000;

/**
 * What the model is asked to return.
 *
 * Deliberately looser than `createBrewSchema`. If the model is handed the real
 * rules and answers with a rating of 9, the SDK throws and the user gets an
 * error for a sentence that was merely misread — while the contract says the
 * field should simply be dropped and the rest of the proposal kept. So the
 * model is asked for plain types, and the real rules are applied afterwards
 * where a failure can be turned into an omission.
 *
 * Optional rather than nullable throughout, because "the sentence did not say"
 * and "the sentence said nothing" are the same answer here.
 */
const extractionSchema = z.object({
  beans: z.string().optional(),
  method: z.enum(BREW_METHOD_SLUGS).optional(),
  coffeeGrams: z.number().optional(),
  waterGrams: z.number().optional(),
  rating: z.number().optional(),
  tastingNotes: z.string().optional(),
  brewedAt: z.string().optional(),
  inferred: z.array(z.enum(BREW_FIELDS)).optional(),
});

const SYSTEM = `You read one sentence describing a coffee brew and return the brew it describes.

Rules:
- Report only what the sentence supports. Omit any field you would be guessing at. An absent field becomes an empty box the person fills in; an invented one becomes a wrong entry in their log that they accepted without noticing.
- coffeeGrams and waterGrams are grams. "300 water" means 300 grams of water; the amount named next to "water" is the water and the other amount is the dose. Report the two as the sentence assigns them, even when the result looks wrong — an unusual brew is the person's business, and silently swapping the numbers to something more typical would rewrite what they said.
- rating is a whole number from 1 to 5.
- method must be one of the given slugs. Map natural phrasings: "pour over" is v60, "french press" is french-press.
- brewedAt only when the sentence carries an actual date or time. Never "now" and never today's date.
- inferred lists the fields you filled in from indirect evidence rather than an outright statement. "18g" states the dose; a bean name taken from a capitalised word is inferred; "pour over" read as v60 is inferred. Only name fields you actually returned.
- A sentence that describes no brew returns an empty object. That is a correct answer, not a failure.`;

export class GeminiAiProvider implements AiProvider {
  readonly name: string;
  readonly #model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;

  constructor(apiKey: string, modelId: string) {
    this.name = `gemini:${modelId}`;
    this.#model = createGoogleGenerativeAI({ apiKey })(modelId);
  }

  async proposeBrew(text: string, options: AiCallOptions = {}): Promise<BrewProposalResult> {
    options.signal?.throwIfAborted();

    // The caller's signal and our own deadline, whichever fires first. Without
    // the deadline a hung model call keeps a serverless function alive until
    // the platform kills it, and the invoice counts the whole wait.
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    let answer;
    try {
      answer = await generateObject({
        model: this.#model,
        schema: extractionSchema,
        system: SYSTEM,
        prompt: text,
        abortSignal: signal,
        // Reading a sentence is not a reasoning problem. Measured on the
        // documented example, the default budget spends 273 thinking tokens to
        // reach the same object this reaches in none — nine times the output
        // for an identical answer.
        providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low' } } },
      });
    } catch (error) {
      // The model answered with something that was not the requested shape.
      // A 422 the caller can act on by rephrasing, rather than a 500 that says
      // the server is broken when it is working exactly as built.
      if (NoObjectGeneratedError.isInstance(error)) throw AppError.aiParseFailed();
      throw error;
    }

    const { inferred: claimed, ...fields } = answer.object;
    const brew: Record<string, unknown> = {};
    const inferred: BrewField[] = [];

    for (const field of BREW_FIELDS) {
      const raw = fields[field];
      if (raw === undefined) continue;

      // The real rules, applied where a failure can become an omission. This
      // is the contract's "omit rather than propose something invalid", and it
      // is why the model was given the looser schema above.
      const parsed = createBrewSchema.shape[field].safeParse(raw);
      if (!parsed.success || parsed.data === undefined) continue;

      brew[field] = parsed.data;
      if (claimed?.includes(field)) inferred.push(field);
    }

    const result = brewProposalSchema.safeParse({ brew, inferred });

    // Every field was validated on the way in and `inferred` was filtered to
    // fields that survived, so this should not fail. It is checked because the
    // alternative to noticing here is returning a proposal the API promised it
    // would never return.
    if (!result.success) throw AppError.aiParseFailed();

    return {
      proposal: result.data,
      usage: {
        inputTokens: answer.usage.inputTokens ?? 0,
        outputTokens: answer.usage.outputTokens ?? 0,
      },
    };
  }
}
