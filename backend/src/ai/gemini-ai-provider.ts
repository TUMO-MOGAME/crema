import {
  BREW_FIELDS,
  BREW_METHOD_SLUGS,
  brewProposalSchema,
  coachToolNameSchema,
  createBrewSchema,
  FLAVOR_TAG_SLUGS,
  type BrewField,
  type BrewProposal,
  type FlavorTagSlug,
} from '@crema/shared';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, NoObjectGeneratedError, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { AppError } from '../lib/app-error.js';
import type {
  AiCallOptions,
  AiProvider,
  BrewProposalResult,
  CoachAnswerEvent,
  CoachTools,
  ExtractedFlavorTag,
  FlavorTagExtraction,
} from './ai-provider.js';

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
 * The coach's ceiling covers a whole agent run — up to six model steps with
 * tool calls between them — where Quick Log's covers one call. Twice the
 * single-call ceiling, because a run that is still thinking after a minute is
 * not going to say anything worth the bill for the wait.
 */
const COACH_TIMEOUT_MS = 60_000;

/** Steps, not tool calls: each step is one model turn. Six is room for three
 * tool round-trips and a final answer, which no honest question here needs
 * more of — and a loop that cannot stop is a bill that cannot either. */
const COACH_MAX_STEPS = 6;

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

const FLAVOR_SYSTEM = `You read the tasting notes of one coffee brew and name the flavour categories they support, from a closed vocabulary.

Rules:
- Only name a category the notes actually support. "Blackcurrant" supports berry; it does not support chocolate. Notes that describe no recognisable flavour — "fine I guess" — get an empty list, which is a correct answer.
- confidence is 0 to 1: how directly the notes state the category. A category named outright scores high; one implied by a related word scores lower.
- Never invent flavours to be helpful. An empty list beats a guess, because these tags become filters over the person's own log.`;

const COACH_SYSTEM = `You are the brew coach inside Crema, a personal coffee brew log. You answer questions about the user's own log, and nothing else.

Rules:
- Ground every claim in the log. Use the tools to read it before answering; never invent brews, numbers or trends the tools did not return. If the log cannot answer the question, say so plainly.
- Answer with real numbers from the tools — ratios as 1:16-style figures, ratings out of 5 — and keep it short. Two or three sentences is a good answer; a report is not.
- Format for a small panel. Lead with the direct answer in your first sentence. Bold only the figures that answer the question — **1:16**, **4/5** — never whole phrases. When you compare three or more brews, ratios or methods, put them on a dash list, one line each, instead of packing them into a sentence. No headings and no tables.
- When the user asks what to brew or what to change, call proposeBrew with your candidate so they can confirm it in the form. The proposal is shown to them separately: refer to it, do not restate every number.
- You only read. Nothing you do writes to the log; the user confirms any proposal themselves.
- Questions unrelated to the user's coffee get one sentence redirecting to what you can do.`;

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

    return {
      proposal: normaliseProposal(fields, claimed),
      usage: {
        inputTokens: answer.usage.inputTokens ?? 0,
        outputTokens: answer.usage.outputTokens ?? 0,
      },
    };
  }

  /**
   * Flavour tagging: the same single-call shape as Quick Log, with a closed
   * vocabulary instead of a brew schema. The enum in the requested shape is
   * what makes an out-of-vocabulary tag unrepresentable rather than filtered;
   * the clamp and the dedupe below defend the two properties an enum cannot.
   */
  async extractFlavorTags(
    tastingNotes: string,
    options: AiCallOptions = {},
  ): Promise<FlavorTagExtraction> {
    options.signal?.throwIfAborted();

    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    let answer;
    try {
      answer = await generateObject({
        model: this.#model,
        schema: z.object({
          tags: z.array(
            z.object({
              slug: z.enum(FLAVOR_TAG_SLUGS as [FlavorTagSlug, ...FlavorTagSlug[]]),
              confidence: z.number(),
            }),
          ),
        }),
        system: FLAVOR_SYSTEM,
        prompt: tastingNotes,
        abortSignal: signal,
        providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low' } } },
      });
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) throw AppError.aiParseFailed();
      throw error;
    }

    // One entry per tag, keeping the model's strongest claim, confidence held
    // to [0, 1] — a 1.2 from an enthusiastic model is a 1, not an error the
    // user sees for notes they wrote in good faith.
    const strongest = new Map<FlavorTagSlug, ExtractedFlavorTag>();
    for (const tag of answer.object.tags) {
      const confidence = Math.min(1, Math.max(0, tag.confidence));
      const existing = strongest.get(tag.slug);
      if (!existing || existing.confidence < confidence) {
        strongest.set(tag.slug, { slug: tag.slug, confidence });
      }
    }

    return {
      tags: [...strongest.values()],
      usage: {
        inputTokens: answer.usage.inputTokens ?? 0,
        outputTokens: answer.usage.outputTokens ?? 0,
      },
    };
  }

  /**
   * The agent loop: `streamText` with the four tools, capped at
   * `COACH_MAX_STEPS` steps and `COACH_TIMEOUT_MS` overall.
   *
   * Three of the tools are pass-throughs to the `CoachTools` handed in — the
   * adapter's job is the loop, not the log. `proposeBrew` is the adapter's
   * own: its input is the same loose extraction shape Quick Log uses, its
   * output goes through the same normalisation, and the resulting proposal is
   * yielded as an event rather than woven into the text — the form is where a
   * candidate belongs, not a paragraph.
   *
   * Each tool's result carries a one-line `summary`. Sending it to the model
   * as well as the trace costs a few tokens and buys a guarantee: the trace
   * the reader sees and the context the model reasoned over are the same
   * account of what the tool said.
   */
  async *coach(
    question: string,
    tools: CoachTools,
    options: AiCallOptions = {},
  ): AsyncGenerator<CoachAnswerEvent> {
    options.signal?.throwIfAborted();

    const timeout = AbortSignal.timeout(COACH_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    // Filled by the proposeBrew tool and drained when its result streams past,
    // so the proposal event lands in order with the trace line that made it.
    const proposals: BrewProposal[] = [];
    let toolCalls = 0;

    const result = streamText({
      model: this.#model,
      system: COACH_SYSTEM,
      prompt: question,
      abortSignal: signal,
      stopWhen: stepCountIs(COACH_MAX_STEPS),
      tools: {
        listBrews: tool({
          description:
            'Read the brew log, newest first. Optionally filter by method or minimum rating.',
          inputSchema: z.object({
            method: z.enum(BREW_METHOD_SLUGS).optional(),
            minRating: z.number().int().min(1).max(5).optional(),
            limit: z.number().int().min(1).max(50).optional(),
          }),
          execute: (args) => tools.listBrews(args),
        }),
        getBrewStats: tool({
          description:
            'Aggregates over the whole log: totals, average rating, and per-method rating and ratio figures.',
          inputSchema: z.object({}),
          execute: () => tools.getBrewStats(),
        }),
        findSimilarBrews: tool({
          description: 'Brews whose beans match a name, for like-for-like comparison.',
          inputSchema: z.object({ beans: z.string() }),
          execute: (args) => tools.findSimilarBrews(args),
        }),
        proposeBrew: tool({
          description:
            'Show the user a candidate brew to confirm in the Add form. Include only fields you have grounds for.',
          inputSchema: extractionSchema,
          execute: (candidate) => {
            const { inferred: claimed, ...fields } = candidate;

            // Everything a proposal tool suggests is the model's idea, so an
            // unmade inferred claim defaults to "all of it" rather than none.
            proposals.push(normaliseProposal(fields, claimed ?? [...BREW_FIELDS]));

            return Promise.resolve({
              summary: 'Proposed a brew for the user to confirm in the Add form.',
              data: 'The candidate is now shown to the user. Refer to it; do not restate its numbers.',
            });
          },
        }),
      },
    });

    // Everything the stream carries beyond these four — step boundaries, tool
    // input deltas, reasoning bookkeeping — is detail the events above already
    // summarise, and is deliberately let pass.
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        if (part.text) yield { type: 'text', delta: part.text };
      } else if (part.type === 'tool-result') {
        // The SDK types the name as `string` once it is streaming; the enum
        // check narrows it, and a name outside the vocabulary — which would
        // take a bug above to produce — is dropped rather than emitted into a
        // stream the frontend validates.
        const tool = coachToolNameSchema.safeParse(part.toolName);
        if (!tool.success) continue;

        toolCalls += 1;
        yield { type: 'tool-call', tool: tool.data, summary: readSummary(part.output) };

        // Drained here rather than in execute, because only the stream knows
        // the order events reach the reader in.
        if (tool.data === 'proposeBrew') {
          const proposal = proposals.shift();
          if (proposal) yield { type: 'proposal', proposal };
        }
      } else if (part.type === 'error') {
        // The loop must not swallow a failed run: no partial answer that
        // trails off mid-sentence with nothing saying why.
        throw part.error instanceof Error ? part.error : new Error(String(part.error));
      } else if (part.type === 'abort') {
        throw signal.reason instanceof Error ? signal.reason : new Error('The call was aborted.');
      }
    }

    const usage = await result.totalUsage;

    yield {
      type: 'done',
      usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
      toolCalls,
    };
  }
}

/**
 * The extraction, held to the real rules — shared by Quick Log and the coach's
 * proposeBrew tool, because "a provider never emits a proposal the API would
 * refuse" has to be one piece of code, not one promise per call site.
 *
 * A field the schema refuses is dropped rather than failed on: the person sees
 * an empty box instead of an error for a value they never typed. `inferred`
 * keeps only claims about fields that survived.
 */
function normaliseProposal(
  fields: Partial<Record<BrewField, unknown>>,
  claimed: readonly BrewField[] | undefined,
): BrewProposal {
  const brew: Record<string, unknown> = {};
  const inferred: BrewField[] = [];

  for (const field of BREW_FIELDS) {
    const raw = fields[field];
    if (raw === undefined) continue;

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

  return result.data;
}

/**
 * A tool result's trace line. Typed access would be free inside `execute`, but
 * by the time the result streams past it is the SDK's `unknown` — so the shape
 * is checked rather than asserted, and a tool that forgot its summary shows as
 * exactly that instead of as `undefined` in the reader's trace.
 */
function readSummary(output: unknown): string {
  if (
    typeof output === 'object' &&
    output !== null &&
    'summary' in output &&
    typeof output.summary === 'string'
  ) {
    return output.summary;
  }

  return 'The tool returned no summary.';
}
