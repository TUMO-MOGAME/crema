import { z } from 'zod';
import { createBrewSchema } from './brew.js';

/**
 * The contract for the AI surfaces, shared by both sides for the same reason
 * everything else here is: the backend parses what the model produced with it,
 * and the frontend builds the confirmation form from it. One definition, so a
 * proposal the API is willing to emit is a proposal the form knows how to show.
 *
 * The rule the whole file is built around is that the model proposes and the
 * human commits. Nothing in here is a brew. `BrewProposal` is a *candidate* for
 * one — deliberately a separate type from `CreateBrewInput`, so a proposal
 * cannot be handed to the repository by accident. Turning one into the other
 * takes a person pressing Save.
 */

export const AI_LIMITS = {
  /**
   * The longest sentence Quick Log will read.
   *
   * A cap rather than an unbounded field because prompt length is cost and
   * latency, and because a megabyte of text pasted into the box is not a brew
   * description. Generous enough for the longest thing anyone would actually
   * dictate about one cup of coffee.
   */
  quickLogMaxLength: 500,
} as const;

/**
 * The fields of a brew a model is allowed to fill in.
 *
 * Derived from the create contract rather than restated, so a new brew field
 * cannot be added without deciding whether the model may propose it.
 */
export const BREW_FIELDS = [
  'beans',
  'method',
  'coffeeGrams',
  'waterGrams',
  'rating',
  'tastingNotes',
  'brewedAt',
] as const satisfies readonly (keyof z.infer<typeof createBrewSchema>)[];

export type BrewField = (typeof BREW_FIELDS)[number];

export const brewFieldSchema = z.enum(BREW_FIELDS);

/** `POST /api/ai/quick-log` body. */
export const quickLogRequestSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, { message: 'Describe the brew in a sentence' })
      .max(AI_LIMITS.quickLogMaxLength, {
        message: `Keep it under ${AI_LIMITS.quickLogMaxLength} characters`,
      }),
  })
  .strict();

export type QuickLogRequest = z.infer<typeof quickLogRequestSchema>;

/**
 * What the model came back with.
 *
 * `brew` is partial on purpose. A sentence that never mentions water is missing
 * a required field, and the honest representation of that is an absent value
 * the user fills in — not a plausible number the model invented and the user
 * accepted without noticing. Every field present has already been validated by
 * the same rules the API enforces, so the form can trust what it is given and
 * only has to collect the rest.
 *
 * `inferred` is what makes the confirmation step meaningful. It names the fields
 * the model supplied without being told them outright, so the form can mark
 * those and leave the reader's attention on the parts worth checking. Without
 * it, a pre-filled form asks the user to re-read everything, which is the work
 * Quick Log was supposed to remove.
 */
export const brewProposalSchema = z
  .object({
    brew: createBrewSchema.partial(),
    inferred: z.array(brewFieldSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Claiming to have inferred a field that was not proposed is incoherent,
    // and it would light up a form control that has nothing in it. Cheap to
    // state here, and it holds every provider to it rather than trusting each.
    for (const field of value.inferred) {
      if (value.brew[field] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['inferred'],
          message: `"${field}" is listed as inferred but is not part of the proposal`,
        });
      }
    }

    // A field named twice would render as two highlights on one input.
    if (new Set(value.inferred).size !== value.inferred.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['inferred'],
        message: 'A field may only be listed as inferred once',
      });
    }
  });

export type BrewProposal = z.infer<typeof brewProposalSchema>;

/** A proposal that determined nothing — a valid answer, not a failure. */
export const EMPTY_BREW_PROPOSAL: BrewProposal = { brew: {}, inferred: [] };
