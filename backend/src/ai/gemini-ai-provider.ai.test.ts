import { describeAiProviderContract } from './ai-provider.contract';
import { GeminiAiProvider } from './gemini-ai-provider';

/**
 * The Gemini adapter, against the real model.
 *
 * The suite it runs is the one the fake passes, and it was written before this
 * adapter existed. Nothing in it was adjusted to accommodate what the model
 * turned out to do — which is the only way the exercise proves anything. A
 * contract edited until the implementation passes is a description, not a
 * contract.
 *
 * Not part of `npm test`: it calls a hosted model, so it costs money, needs a
 * key, and is slow. It runs under `npm run test:ai`, and CI runs it only where
 * a key is configured.
 */

const apiKey = process.env.GEMINI_API_KEY;
const modelId = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is required for provider tests. See vitest.ai.config.ts.');
}

describeAiProviderContract('GeminiAiProvider', {
  fresh: () => Promise.resolve(new GeminiAiProvider(apiKey, modelId)),
});
