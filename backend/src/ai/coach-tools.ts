import { BREW_PAGE, brewMethodSchema, brewRatio, type Brew } from '@crema/shared';
import type { BrewRepository } from '../repositories/brew.repository.js';
import type { CoachBrew, CoachToolResult, CoachTools, ListBrewsToolArgs } from './ai-provider.js';

/**
 * The coach's read access to the log, built over the same repository the
 * routes use — so what the agent reads and what the list screen shows can
 * never be two different logs.
 *
 * Everything model-facing here is defensive, because the arguments arrive from
 * a model rather than from typed application code. A method that is not in the
 * vocabulary is ignored rather than thrown on, a rating outside 1–5 is
 * clamped, and every limit is bounded. The model recovering from a slightly
 * wrong call beats the whole answer dying on one.
 *
 * The rating filter runs in memory over a bounded page rather than in the
 * repository. `BrewRepository` filters by what the product filters by, and no
 * screen filters by rating; growing the persistence contract — two adapters
 * and the suite that holds them together — for one agent argument would be
 * the tail wagging the dog. At this log's scale, reading a page and filtering
 * it is the honest cost. The day a log outgrows a page, the filter moves down
 * a layer and this comment goes with it.
 */

/** The most brews any tool call reads or returns. */
const READ_LIMIT = BREW_PAGE.maxLimit;
const DEFAULT_LIST_LIMIT = 20;

export function createCoachTools(repository: BrewRepository): CoachTools {
  return {
    async listBrews(args: ListBrewsToolArgs): Promise<CoachToolResult<CoachBrew[]>> {
      const method = brewMethodSchema.safeParse(args.method);
      const minRating = clampRating(args.minRating);
      const limit = clampLimit(args.limit);

      const page = await repository.list({
        ...(method.success ? { method: method.data } : {}),
        limit: READ_LIMIT,
        offset: 0,
      });

      const matching = minRating ? page.brews.filter((brew) => brew.rating >= minRating) : page.brews; // prettier-ignore
      const brews = matching.slice(0, limit).map(toCoachBrew);

      const filters = [
        method.success ? method.data : null,
        minRating ? `rated ${minRating}+` : null,
      ].filter(Boolean);

      return {
        summary:
          `Read ${brews.length} of ${matching.length} matching brews` +
          (filters.length ? ` (${filters.join(', ')})` : '') +
          ', newest first.' +
          partialLogNote(page.brews.length, page.total),
        data: brews,
      };
    },

    async getBrewStats(): Promise<CoachToolResult<Awaited<ReturnType<BrewRepository['stats']>>>> {
      const stats = await repository.stats();

      return {
        summary:
          stats.brewCount === 0
            ? 'Read the stats: the log is empty.'
            : `Read the stats: ${stats.brewCount} brews across ${stats.methodsUsed} ` +
              `${stats.methodsUsed === 1 ? 'method' : 'methods'}, ` +
              `average rating ${stats.averageRating ?? '—'}.`,
        data: stats,
      };
    },

    async findSimilarBrews(args: { beans: string }): Promise<CoachToolResult<CoachBrew[]>> {
      const needle = String(args.beans ?? '')
        .trim()
        .toLowerCase();

      if (!needle) {
        return { summary: 'Looked for similar brews, but no beans were named.', data: [] };
      }

      const page = await repository.list({ limit: READ_LIMIT, offset: 0 });
      const brews = page.brews
        .filter((brew) => brew.beans.toLowerCase().includes(needle))
        .slice(0, DEFAULT_LIST_LIMIT)
        .map(toCoachBrew);

      return {
        summary:
          `Found ${brews.length} ${brews.length === 1 ? 'brew' : 'brews'} of beans matching "${args.beans}".` +
          partialLogNote(page.brews.length, page.total),
        data: brews,
      };
    },
  };
}

/**
 * The truncation, said out loud when it happened.
 *
 * These tools read one bounded page, which is the honest cost at this log's
 * scale — but past `READ_LIMIT` brews, a summary that presents the slice as
 * the whole log would have the model reasoning, and the trace panel claiming,
 * over data neither knows is partial. The note keeps both honest for the cost
 * of a sentence, and it costs nothing at all until a log outgrows the page.
 */
function partialLogNote(scanned: number, total: number): string {
  return total > scanned ? ` Searched the newest ${scanned} of ${total} logged brews.` : '';
}

function toCoachBrew(brew: Brew): CoachBrew {
  return {
    beans: brew.beans,
    method: brew.method,
    coffeeGrams: brew.coffeeGrams,
    waterGrams: brew.waterGrams,
    ratio: brewRatio(brew.coffeeGrams, brew.waterGrams),
    rating: brew.rating,
    tastingNotes: brew.tastingNotes,
    brewedAt: brew.brewedAt,
  };
}

function clampRating(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIST_LIMIT;
  return Math.min(READ_LIMIT, Math.max(1, Math.round(value)));
}
