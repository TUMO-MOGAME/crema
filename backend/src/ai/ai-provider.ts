import type { BrewProposal } from '@crema/shared';

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
 * The interface is deliberately one method wide today. The coach in PLANNING
 * section 6.2 is a tool-calling loop over the user's own log, and its shape
 * depends on the tools it is given — so it is added when it is built rather
 * than guessed at now. An interface designed around a feature nobody has
 * written yet is a shape that has to be corrected once the feature exists.
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
}

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
