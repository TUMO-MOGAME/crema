import type { BrewProposal, BrewStats, CoachToolName, FlavorTagSlug } from '@crema/shared';

/**
 * The seam between this application and whatever is generating text.
 *
 * It exists for the same reason `BrewRepository` does, and it is worth being
 * precise about what that reason is. It is not that Gemini might be swapped for
 * another model one day — that is a nice property and not what pays for the
 * indirection. It is that a suite which calls a hosted model is slow, costs
 * money per run, needs a secret on every machine that runs it, and fails for
 * reasons that have nothing to do with the change under test. Behind this
 * interface a deterministic fake answers instantly and for free, and CI can
 * assert the behaviour of the AI surfaces on every pull request without a key.
 *
 * The methods speak the domain's language rather than the model's. There is no
 * `generateText` here, no prompt, no temperature, no message array — those are
 * the adapter's problem, exactly as `method_id` is Postgres's problem and never
 * appears in `BrewRepository`. What a caller asks for is a brew proposal.
 *
 * The interface stayed one method wide until the coach existed, on the theory
 * that an interface designed around a feature nobody has written yet is a shape
 * that has to be corrected once the feature exists. The coach is now written,
 * and its shape came out as predicted only in outline: a tool-calling loop,
 * yes, but streamed — so the method returns events as they happen rather than
 * an answer once it is over, because an answer that takes ten seconds to
 * compose and arrives all at once reads as a hang.
 */
export interface AiProvider {
  /**
   * Named for logs and for the trace panel, so a reader can tell an answer that
   * came from a model apart from one that came from the fake.
   */
  readonly name: string;

  /**
   * Read one sentence and propose the brew it describes.
   *
   * The contract every implementation is held to lives in
   * `ai-provider.contract.ts`. Three parts of it matter enough to restate:
   *
   * - **What comes back is always schema-valid, or nothing comes back.** A
   *   provider may not return a proposal carrying a rating of 9 or 400 grams of
   *   coffee. If the model produced something the contract refuses, the field is
   *   dropped or the call throws — never a value that would fail validation one
   *   layer later.
   * - **Determining nothing is a success.** A sentence about the weather parses
   *   to an empty proposal, not an error. The user is shown a form to fill in,
   *   which is where they were going anyway.
   * - **Failure is `AI_PARSE_FAILED`.** Reserved for the model answering with
   *   something that is not a proposal at all. Anything the caller could fix by
   *   rephrasing is this; anything else is a 500 and deserves to be.
   *
   * `signal` is honoured, and an already-aborted signal rejects before any work
   * is done. Every model call in this app is bounded — an AI surface that can
   * hang holds a serverless function open until the platform kills it, and bills
   * for the whole time.
   */
  proposeBrew(text: string, options?: AiCallOptions): Promise<BrewProposalResult>;

  /**
   * Answer one question about the caller's log, with tool access to it.
   *
   * The tools are handed in rather than owned, for the same reason the routes
   * receive a repository: the provider knows how to run an agent loop and
   * nothing about where brews live. Everything it can learn about the log
   * arrives through `tools`, which are read-only by construction.
   *
   * What comes back is the answer as it happens: text deltas, a trace line per
   * tool call, any brew the agent proposes, and a final `done` carrying usage.
   * The contract on ordering is small and load-bearing — `done` is the last
   * event and appears exactly once, each `tool-call` is yielded before the text
   * that depends on it, and every `proposal` has already passed
   * `brewProposalSchema`. A failure mid-answer throws out of the iterable
   * rather than yielding an event, so the caller has one error path.
   */
  coach(
    question: string,
    tools: CoachTools,
    options?: AiCallOptions,
  ): AsyncIterable<CoachAnswerEvent>;

  /**
   * Read tasting notes and name the flavour tags they support.
   *
   * The vocabulary is closed — the fourteen SCA categories the migration
   * seeds — and a provider may only answer from it. Notes that describe no
   * recognisable flavour yield an empty list, which is a success for the same
   * reason an empty proposal is: the honest answer to "what does 'fine I
   * guess' taste of" is nothing.
   *
   * Confidence is per tag and within [0, 1]. What a caller does with the tags
   * — storing them with provenance, showing them, ignoring them — is not the
   * provider's business.
   */
  extractFlavorTags(tastingNotes: string, options?: AiCallOptions): Promise<FlavorTagExtraction>;
}

/** The tags the notes support, and what the reading cost. */
export interface FlavorTagExtraction {
  tags: ExtractedFlavorTag[];
  usage: AiUsage;
}

export interface ExtractedFlavorTag {
  slug: FlavorTagSlug;
  confidence: number;
}

/**
 * What the agent may do to the log: read it three ways, and propose to it —
 * never write. `proposeBrew` is absent on purpose: proposing is not a question
 * the log can answer, so the *provider* owns that tool and emits its result as
 * a `proposal` event after validating it, the same contract Quick Log honours.
 *
 * Each result carries a one-line human `summary` alongside the data. The data
 * is for the model; the summary is what the trace panel shows the reader, and
 * writing it here — next to the query it describes — is what keeps the two
 * telling the same story.
 */
export interface CoachTools {
  listBrews(args: ListBrewsToolArgs): Promise<CoachToolResult<CoachBrew[]>>;
  getBrewStats(): Promise<CoachToolResult<BrewStats>>;
  findSimilarBrews(args: { beans: string }): Promise<CoachToolResult<CoachBrew[]>>;
}

/**
 * Every property tolerates an explicit `undefined`, because the arguments come
 * from a model through a schema whose optionals parse to exactly that — and
 * `exactOptionalPropertyTypes` holds the seam to the difference.
 */
export interface ListBrewsToolArgs {
  method?: string | undefined;
  minRating?: number | undefined;
  limit?: number | undefined;
}

export interface CoachToolResult<T> {
  summary: string;
  data: T;
}

/**
 * A brew as the model reads it: the fields that inform advice, and no ids,
 * no timestamps-of-record, no soft-delete bookkeeping. Smaller on purpose —
 * every row here is prompt tokens on every question that lists brews.
 */
export interface CoachBrew {
  beans: string;
  method: string;
  coffeeGrams: number;
  waterGrams: number;
  ratio: number;
  rating: number;
  tastingNotes: string;
  brewedAt: string;
}

/** The provider's half of the stream vocabulary — everything but `error`,
 * because a provider that fails throws, and turning that into an event for the
 * wire is the route's job. */
export type CoachAnswerEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; tool: CoachToolName; summary: string }
  | { type: 'proposal'; proposal: BrewProposal }
  | { type: 'done'; usage: AiUsage; toolCalls: number };

export interface AiCallOptions {
  /** Aborts the call. Providers reject rather than resolving half an answer. */
  signal?: AbortSignal;
}

/**
 * The proposal, and what it cost to produce.
 *
 * Usage rides alongside the proposal rather than inside it because it is not
 * part of the brew — the frontend's form has no use for a token count, while
 * the log and the trace panel have no use for anything else. Keeping it out of
 * the shared schema is what stops "how much did that cost" from becoming a
 * field the confirmation form has to know to ignore.
 */
export interface BrewProposalResult {
  proposal: BrewProposal;
  usage: AiUsage;
}

/**
 * Tokens in and out for one call.
 *
 * Recorded per request because cost visibility that arrives as a monthly total
 * tells you that something is expensive and never which thing.
 */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}
