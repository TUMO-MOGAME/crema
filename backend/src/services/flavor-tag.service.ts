import type { BrewFlavorTag } from '@crema/shared';
import type { AiProvider } from '../ai/index.js';
import { AppError } from '../lib/app-error.js';
import type { BrewRepository } from '../repositories/brew.repository.js';

/**
 * Turning tasting notes into the tags that make them filterable.
 *
 * The one AI surface that writes, and the write is narrower than it looks: the
 * person already committed the notes when they pressed Save, and what lands in
 * `brew_flavor_tags` is an index over their own words — carried with `source:
 * 'ai'` and a confidence, so a derived tag is never mistaken for a chosen one.
 * PLANNING section 6.3 states the position: normalising notes into the
 * vocabulary is the reason that join table exists.
 *
 * Extraction is asked for, not ambient. The client requests it after a save
 * succeeds, in its own request, so a slow model can never make saving a brew
 * feel slow — and a deployment where it fails loses tags, never brews.
 */
export class FlavorTagService {
  readonly #provider: AiProvider | null;
  readonly #brews: BrewRepository;

  constructor(provider: AiProvider | null, brews: BrewRepository) {
    this.#provider = provider;
    this.#brews = brews;
  }

  get available(): boolean {
    return this.#provider !== null;
  }

  async extract(
    brewId: string,
    options: { signal?: AbortSignal; requestId?: string } = {},
  ): Promise<BrewFlavorTag[]> {
    if (!this.#provider) throw AppError.aiUnavailable();

    // The notes are read from the store rather than accepted in the request:
    // the tags must describe what was saved, and a body that could say
    // anything would let a caller tag a brew with words it never contained.
    const brew = await this.#brews.findById(brewId);
    if (!brew) throw AppError.notFound('Brew', brewId);

    const started = Date.now();
    const call = options.signal ? { signal: options.signal } : {};
    const { tags, usage } = await this.#provider.extractFlavorTags(brew.tastingNotes, call);

    const stored = await this.#brews.replaceAiFlavorTags(brewId, tags);
    // Deleted between the read and the write — gone is gone, and the 404 is
    // more honest than a list of tags on a brew that no longer answers.
    if (stored === null) throw AppError.notFound('Brew', brewId);

    // The same cost line every AI call writes, and no note text in it.
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'ai.flavor_tags',
        requestId: options.requestId,
        provider: this.#provider.name,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        notesChars: brew.tastingNotes.length,
        tagsExtracted: tags.length,
        durationMs: Date.now() - started,
      }),
    );

    return stored;
  }
}
