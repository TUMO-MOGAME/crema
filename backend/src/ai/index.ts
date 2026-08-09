import { env, isAiEnabled, type Env } from '../config/env.js';
import type { AiProvider } from './ai-provider.js';
import { GeminiAiProvider } from './gemini-ai-provider.js';

/**
 * The one place that decides whether this deployment has an AI at all.
 *
 * `null` rather than a throw, because null is the state the rest of the app is
 * built to handle: `/api/health` reports `ai.enabled: false`, the AI routes
 * answer 503 with `AI_UNAVAILABLE`, and the frontend hides those surfaces
 * instead of offering something that breaks when pressed. A reviewer who clones
 * this repository without a Gemini key gets an app where every requirement in
 * the brief works and two extra features are politely absent.
 *
 * `null` rather than the fake, too, and that is the more important half.
 * Substituting the fake when the key is missing would make Quick Log appear to
 * work while returning answers no model produced — helpfulness indistinguishable
 * from a bug until someone trusts it. The fake is reachable only by
 * constructing it, which is what the tests do and what keeps it out of a
 * request path by accident.
 *
 * This function is now the whole of "turning the AI on", in the same way
 * `createBrewRepository` is the whole of turning Supabase on: set the key in
 * the deployment and redeploy. No route or service changes, because nothing
 * above this line has seen anything but the `AiProvider` interface.
 */
export function createAiProvider(config: Env = env): AiProvider | null {
  // Restated rather than asserted away. `isAiEnabled` is the check every other
  // caller uses, and narrowing an optional string is not something it can do
  // for the type system.
  if (!isAiEnabled(config) || !config.GEMINI_API_KEY) return null;

  return new GeminiAiProvider(config.GEMINI_API_KEY, config.GEMINI_MODEL);
}

/**
 * Types and the factory, and deliberately nothing else.
 *
 * `repositories/index.ts` exports `createBrewRepository` and its interfaces
 * without re-exporting either adapter or the contract suite, and the reason is
 * not tidiness. `app.ts` imports this file, so everything named here is
 * reachable from `src/server.ts` and lands in the production bundle.
 *
 * Re-exporting `describeAiProviderContract` from here put `ai-provider.contract`
 * — which imports vitest, as a test helper should — into that graph. It built
 * fine on any machine with devDependencies installed and failed the deploy,
 * where they are not: `Could not resolve "vitest"`. CI could not catch it
 * either, because CI installs devDependencies too.
 *
 * Test files import the fake and the contract from their own modules directly,
 * which is what the repository tests already do.
 */
export type { AiCallOptions, AiProvider, AiUsage, BrewProposalResult } from './ai-provider.js';
