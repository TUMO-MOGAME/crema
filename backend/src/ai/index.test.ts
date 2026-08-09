import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env';
import { createAiProvider } from './index';
import { FakeAiProvider } from './fake-ai-provider';
import { GeminiAiProvider } from './gemini-ai-provider';

/**
 * Constructing `GeminiAiProvider` opens no connection and sends no request, so
 * these run offline and for free. What they assert is the decision, not the
 * model: which provider a given configuration produces, and — the part worth
 * having a test for — that a missing key never quietly produces the fake.
 */

const base = { GEMINI_MODEL: 'gemini-flash-latest' } as Env;

describe('createAiProvider', () => {
  it('returns nothing when no key is configured', () => {
    expect(createAiProvider({ ...base, GEMINI_API_KEY: undefined })).toBeNull();
  });

  it('returns the Gemini provider when a key is configured', () => {
    const provider = createAiProvider({ ...base, GEMINI_API_KEY: 'test-key' });

    expect(provider).toBeInstanceOf(GeminiAiProvider);
  });

  it('never returns the fake, whatever the configuration', () => {
    // The fake answers plausibly without a model, so reaching a request path
    // would mean Quick Log appearing to work while returning something Gemini
    // never said. Absent is the honest state; a convincing substitute is not.
    for (const key of [undefined, '', 'test-key']) {
      expect(createAiProvider({ ...base, GEMINI_API_KEY: key })).not.toBeInstanceOf(FakeAiProvider);
    }
  });

  it('names the model it will call, so a trace can say which one answered', () => {
    const provider = createAiProvider({ ...base, GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'x' });

    expect(provider?.name).toBe('gemini:x');
  });
});
