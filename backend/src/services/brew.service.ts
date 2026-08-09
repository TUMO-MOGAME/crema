import {
  BREW_PAGE,
  type Brew,
  type BrewPage,
  type BrewQuery,
  type BrewStats,
  type CreateBrewInput,
  type UpdateBrewInput,
} from '@crema/shared';
import { AppError } from '../lib/app-error.js';
import type { BrewFilter, BrewRepository } from '../repositories/brew.repository.js';

/**
 * The rules about brews that are neither HTTP nor storage.
 *
 * Two things live here and nowhere else. First, "this brew does not exist" —
 * the repository reports that as `null`, and turning `null` into a 404 is a
 * decision, not a lookup. Second, the rules Zod cannot express: a field schema
 * validates one value at a time and has no idea what time it is now or what the
 * other fields say.
 *
 * Nothing in this file imports Hono, and nothing imports a database. That is
 * the layering rule holding, and it is what lets the same rules be tested in
 * milliseconds without a server or a schema.
 */
export class BrewService {
  constructor(private readonly repository: BrewRepository) {}

  /**
   * One page of the log.
   *
   * Resolving the page defaults here rather than in the adapters is what keeps
   * both of them agreeing about what an unspecified `limit` means, and puts the
   * ceiling somewhere a route cannot forget to apply.
   */
  list(query: BrewQuery = {}): Promise<BrewPage> {
    const filter: BrewFilter = {
      limit: Math.min(query.limit ?? BREW_PAGE.defaultLimit, BREW_PAGE.maxLimit),
      offset: query.offset ?? 0,
    };

    if (query.method !== undefined) filter.method = query.method;

    return this.repository.list(filter);
  }

  async get(id: string): Promise<Brew> {
    const brew = await this.repository.findById(id);
    if (!brew) throw AppError.notFound('Brew', id);

    return brew;
  }

  async create(input: CreateBrewInput): Promise<Brew> {
    assertBrewIsPossible(input);

    return this.repository.create(input);
  }

  async update(id: string, changes: UpdateBrewInput): Promise<Brew> {
    const existing = await this.repository.findById(id);
    if (!existing) throw AppError.notFound('Brew', id);

    // Checked against the brew as it will be, not against the patch. A rule
    // that only holds on create is a rule you can walk around one PATCH at a
    // time — send water on its own, then coffee on its own, and end up in a
    // state POST would have refused.
    assertBrewIsPossible({
      coffeeGrams: changes.coffeeGrams ?? existing.coffeeGrams,
      waterGrams: changes.waterGrams ?? existing.waterGrams,
      brewedAt: changes.brewedAt ?? existing.brewedAt,
    });

    const updated = await this.repository.update(id, changes);
    // Null here means it was deleted between the read and the write. Rare, and
    // still a 404 — the brew the caller asked to change is gone.
    if (!updated) throw AppError.notFound('Brew', id);

    return updated;
  }

  /**
   * Straight through to the repository. No rule of its own yet, and the method
   * exists anyway so the route never reaches past the service to the store —
   * the day stats gain a rule, there is somewhere for it to go.
   */
  stats(): Promise<BrewStats> {
    return this.repository.stats();
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.repository.softDelete(id);
    if (!deleted) throw AppError.notFound('Brew', id);
  }
}

/**
 * A brew's clock can be a minute off ours without lying.
 *
 * `brewedAt` is chosen by the client, so it carries the client's clock. A
 * tolerance is the difference between rejecting a genuinely impossible date and
 * rejecting whoever has not run NTP lately.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

interface BrewFacts {
  coffeeGrams: number;
  waterGrams: number;
  brewedAt?: string | undefined;
}

/**
 * The rules that make a valid-looking body an impossible brew.
 *
 * These are 422s, not 400s. Every field passed its own schema — what failed is
 * a claim about the fields together, or about the world. The distinction is
 * worth keeping because the client can act on it: a 400 means a field is wrong
 * and can be highlighted, a 422 means the combination is wrong.
 */
function assertBrewIsPossible(brew: BrewFacts): void {
  if (brew.brewedAt !== undefined) {
    const brewedAt = Date.parse(brew.brewedAt);

    if (brewedAt > Date.now() + CLOCK_SKEW_TOLERANCE_MS) {
      throw AppError.semantic('A brew cannot be logged before it is made.', [
        { field: 'brewedAt', message: 'The brew date cannot be in the future' },
      ]);
    }
  }

  // Less water than coffee is not a strong brew, it is a transcription error —
  // most often grams and millilitres entered the wrong way round. Even ristretto,
  // the most concentrated thing anyone makes, uses more water than coffee.
  if (brew.waterGrams <= brew.coffeeGrams) {
    throw AppError.semantic(
      'A brew needs more water than coffee. Check whether the two are the right way round.',
      [{ field: 'waterGrams', message: 'Water must be greater than coffee' }],
    );
  }
}
