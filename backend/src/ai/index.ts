/**
 * The AI seam: an interface, the suite that defines it, and a fake that passes.
 *
 * There is deliberately no `createAiProvider` here yet. The obvious version of
 * it — return a provider when `GEMINI_API_KEY` is set, `null` otherwise —
 * cannot be written honestly until a provider exists to return, and shipping it
 * early would put the app in a state it is not designed to be in: `/api/health`
 * reporting `ai.enabled: true` because a key is present, while every AI route
 * answers 503 because there is nothing behind them. One of those two would be
 * lying, and which one is not obvious from either side.
 *
 * So the factory arrives with the Gemini adapter, in the same commit that gives
 * it something to build. Until then the only way to get a provider is to
 * construct one, which is what the tests do and what keeps the fake out of a
 * request path by accident.
 */

export type { AiCallOptions, AiProvider, AiUsage, BrewProposalResult } from './ai-provider';
export { describeAiProviderContract, type AiProviderHarness } from './ai-provider.contract';
export { FakeAiProvider } from './fake-ai-provider';
