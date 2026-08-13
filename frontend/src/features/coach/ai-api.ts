import { brewProposalSchema, type BrewProposal, type QuickLogRequest } from '@crema/shared';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client';

/**
 * Every call the AI surfaces make, in one place — the same shape as
 * `brews-api.ts`, for the same reason: the routes are named once, and every
 * response is parsed rather than cast.
 *
 * The proposal is parsed with `brewProposalSchema`, the schema the backend
 * validated the model's answer against before sending it. Parsing it again here
 * is not distrust of our own API so much as the contract doing its job at
 * runtime: a proposal the form receives is a proposal the schema has passed,
 * whichever side changed last.
 */

/**
 * The one part of `/api/health` this feature reads.
 *
 * Deliberately not the whole health shape: the frontend's question is "should
 * the AI surfaces render", and answering it from a narrower schema means a new
 * health field cannot break the form that asks.
 */
const aiHealthSchema = z.object({
  ai: z.object({ enabled: z.boolean() }),
});

export type AiHealth = z.infer<typeof aiHealthSchema>;

export const aiApi = {
  health: () => apiRequest<AiHealth>('/api/health', { schema: aiHealthSchema }),

  quickLog: (text: string) =>
    apiRequest<BrewProposal>('/api/ai/quick-log', {
      method: 'POST',
      body: JSON.stringify({ text } satisfies QuickLogRequest),
      schema: brewProposalSchema,
    }),
};

export const aiKeys = {
  health: ['ai', 'health'] as const,
};
