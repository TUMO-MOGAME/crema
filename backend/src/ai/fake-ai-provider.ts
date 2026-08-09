import {
  BREW_METHOD_SLUGS,
  brewProposalSchema,
  createBrewSchema,
  type BrewField,
  type BrewMethodSlug,
  type BrewProposal,
} from '@crema/shared';
import { AppError } from '../lib/app-error.js';
import type { AiCallOptions, AiProvider, BrewProposalResult } from './ai-provider.js';

/**
 * A provider that reads a sentence with regular expressions instead of a model.
 *
 * This is what the whole interface is for. It answers in microseconds, needs no
 * key, costs nothing, and gives the same answer every time — so the tests for
 * the Quick Log service, its route, and eventually the form it fills can all
 * run on every pull request. A suite that calls a hosted model tests the
 * network as much as the code, and the day the network is slow it tests
 * patience.
 *
 * It is a fake in the strict sense rather than a mock: a working implementation
 * with a simplified engine, not a recording of expected calls. That matters
 * because a test written against a mock passes when the code makes the calls
 * the author imagined, while a test written against this one passes when the
 * code actually gets the brew out of the sentence.
 *
 * What it is not is a fallback. It never stands in for the model at runtime —
 * `createAiProvider` will not hand it to a request. Quick Log without a key is
 * a clean 503, not a quietly worse answer that the user has no way to tell
 * apart from the real thing.
 *
 * Its reach is honest about being a fake. It reads the phrasings the feature is
 * documented with — amounts with units, a method by name, a rating out of five,
 * notes after a cue word — and returns an empty proposal for anything else,
 * which is a legal answer under the contract. Making it cleverer would be
 * writing a language model badly.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';

  /**
   * Synchronous work behind an asynchronous signature, the same shape
   * `InMemoryBrewRepository` uses. The interface is async because a real
   * provider crosses a network; this one does not, and pretending otherwise
   * with an `async` keyword that never awaits says less than this does.
   */
  proposeBrew(text: string, options: AiCallOptions = {}): Promise<BrewProposalResult> {
    // Checked before any work, because the contract says an already-aborted
    // call does nothing. A real provider would be holding an open socket here.
    // Rejected rather than thrown, so an aborted call fails the same way a
    // failed model call would and callers need one kind of handler.
    if (options.signal?.aborted) return Promise.reject(options.signal.reason as Error);

    const brew: Record<string, unknown> = {};
    const inferred: BrewField[] = [];

    // Ordered by how reliably each can be spotted. Water is read before coffee
    // so the number standing next to the word "water" cannot be claimed as the
    // dose — "18g through the V60, 300 water" has two bare numbers and only one
    // correct reading.
    const found = {
      method: readMethod(text),
      waterGrams: readWaterGrams(text),
      coffeeGrams: readCoffeeGrams(text),
      rating: readRating(text),
      tastingNotes: readTastingNotes(text),
      beans: readBeans(text),
      brewedAt: readBrewedAt(text),
    } satisfies Record<BrewField, MaybeReading<unknown>>;

    for (const [field, reading] of Object.entries(found) as [BrewField, MaybeReading<unknown>][]) {
      if (reading === undefined) continue;

      // Every value goes through the field's own rule from the create contract
      // before it is proposed. This is the guarantee that a provider cannot emit
      // a rating of 9: the schema refuses it here and the field is simply left
      // for the user, which is the same as never having read it.
      const parsed = createBrewSchema.shape[field].safeParse(reading.value);
      if (!parsed.success || parsed.data === undefined) continue;

      brew[field] = parsed.data;
      if (!reading.explicit) inferred.push(field);
    }

    const candidate = { brew, inferred };
    const result = brewProposalSchema.safeParse(candidate);

    // Unreachable by construction — every field was validated on the way in.
    // Kept because "by construction" is a claim about code that will be edited,
    // and the alternative to noticing here is emitting a proposal the API
    // promised it would never emit.
    if (!result.success) return Promise.reject(AppError.aiParseFailed());

    return Promise.resolve({ proposal: result.data, usage: estimateUsage(text, result.data) });
  }
}

/**
 * A value the reader found, and whether the sentence said it outright.
 *
 * `explicit` is what drives the highlight on the confirmation form. "300g
 * water" states the water; a lone `4` at the end of a sentence is a rating the
 * reader decided on, and the user deserves to see which is which before saving.
 */
interface Reading<T> {
  value: T;
  explicit: boolean;
}

type MaybeReading<T> = Reading<T> | undefined;

/** Written as `v60`, `V60`, `french press`, `frenchpress`, or the slug itself. */
function readMethod(text: string): MaybeReading<BrewMethodSlug> {
  const haystack = text.toLowerCase();

  for (const slug of BREW_METHOD_SLUGS) {
    // A hyphenated slug is said out loud with a space and typed either way.
    const spelling = slug.replace('-', '[ -]?');

    if (new RegExp(`\\b${spelling}\\b`).test(haystack)) {
      return { value: slug, explicit: true };
    }
  }

  // Named by what it produces rather than what it is, which is common enough in
  // the way people describe a brew to be worth reading — and a guess, so it is
  // marked as one.
  if (/\bpour[ -]?over\b/.test(haystack)) return { value: 'v60', explicit: false };

  return undefined;
}

function readWaterGrams(text: string): MaybeReading<number> {
  const haystack = text.toLowerCase();

  // "300 water", "300g of water", "water: 300", "water 300ml".
  const before = /(\d+(?:\.\d+)?)\s*(?:g|grams?|ml)?\s*(?:of\s+)?water\b/.exec(haystack);
  if (before?.[1]) return { value: Number(before[1]), explicit: true };

  const after = /\bwater\b[:\s]+(\d+(?:\.\d+)?)/.exec(haystack);
  if (after?.[1]) return { value: Number(after[1]), explicit: true };

  return undefined;
}

function readCoffeeGrams(text: string): MaybeReading<number> {
  // Deliberately requires a unit. A bare number in a coffee sentence is more
  // often a rating or a temperature than a dose, and inventing the dose is the
  // one field where being wrong quietly ruins the log.
  const haystack = text
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(?:g|grams?|ml)?\s*(?:of\s+)?water\b/, ' ');

  const dose = /(\d+(?:\.\d+)?)\s*(?:g\b|grams?\b)/.exec(haystack);
  if (dose?.[1]) return { value: Number(dose[1]), explicit: true };

  return undefined;
}

function readRating(text: string): MaybeReading<number> {
  const haystack = text.toLowerCase();

  // "4/5", "4 stars", "rated 4", "solid 4".
  const scored = /\b([1-5])\s*(?:\/\s*5|\s*stars?\b|\s*out of 5\b)/.exec(haystack);
  if (scored?.[1]) return { value: Number(scored[1]), explicit: true };

  const cued = /\b(?:rated|rating|solid|call it)\s+(?:a\s+)?([1-5])\b/.exec(haystack);
  if (cued?.[1]) return { value: Number(cued[1]), explicit: true };

  return undefined;
}

function readTastingNotes(text: string): MaybeReading<string> {
  // Everything after the cue up to a sentence break. The rating clause is
  // trimmed off the end because "blackcurrant and tea, solid 4" describes the
  // flavour and then stops describing it.
  const cued = /(?:tasted like|tasting notes|tastes? of|notes?|flavou?rs?)\b[:\s]+([^.;\n]+)/i.exec(
    text,
  );

  if (!cued?.[1]) return undefined;

  const notes = cued[1]
    .replace(/,?\s*(?:solid|rated|rating|call it)\s+(?:a\s+)?[1-5]\b.*$/i, '')
    .replace(/,?\s*\b[1-5]\s*(?:\/\s*5|stars?|out of 5)\b.*$/i, '')
    .trim()
    .replace(/[,;]$/, '');

  return notes.length > 0 ? { value: notes, explicit: true } : undefined;
}

function readBeans(text: string): MaybeReading<string> {
  // Said outright: "beans: Ethiopian Yirgacheffe", "the Kenyan AA beans".
  //
  // The cue is spelled both ways rather than the pattern being made
  // case-insensitive, because the `i` flag would apply to the capture too and
  // the capture is what distinguishes a bean name from the rest of the
  // sentence. A sentence opening with "Beans:" is the common case, so this is
  // not a corner.
  const labelled =
    /(?:[Bb]eans?|[Cc]offee)\b[:\s]+(?:the\s+)?([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/.exec(text);
  if (labelled?.[1]) return { value: labelled[1], explicit: true };

  const named = /\b(?:the\s+)?([A-Z][\w'-]+)\s+(?:[Bb]eans?|[Cc]offee)\b/.exec(text);
  if (named?.[1]) return { value: named[1], explicit: true };

  // Otherwise the first capitalised word that is not a method name and not the
  // first word of the sentence. "18g of the Ethiopian through the V60" has
  // exactly one, and calling that the beans is a guess worth surfacing.
  const methodWords = new Set(BREW_METHOD_SLUGS.flatMap((slug) => slug.split('-')));

  for (const match of text.matchAll(/(?<!^)(?<![.!?]\s)\b([A-Z][a-z'-]{2,})\b/g)) {
    const word = match[1];
    if (word && !methodWords.has(word.toLowerCase())) {
      return { value: word, explicit: false };
    }
  }

  return undefined;
}

/** Only a date the sentence actually contains. Relative dates are model work. */
function readBrewedAt(text: string): MaybeReading<string> {
  const iso = /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/.exec(text);

  return iso?.[1] ? { value: iso[1], explicit: true } : undefined;
}

/**
 * Roughly four characters to the token, which is the usual English estimate.
 *
 * An estimate is the honest thing for a provider that never called a model, and
 * it keeps the shape of the cost logging exercised in tests. The real adapter
 * reports what the API billed rather than what a heuristic guessed.
 */
function estimateUsage(text: string, proposal: BrewProposal) {
  return {
    inputTokens: Math.ceil(text.length / 4),
    outputTokens: Math.ceil(JSON.stringify(proposal).length / 4),
  };
}
