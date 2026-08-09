import { Hono } from 'hono';
import type { BrewService } from '../services/brew.service.js';
import type { AppEnv } from '../types.js';

/**
 * Aggregates over the whole log.
 *
 * Always 200, never 404: a log with nothing in it is a valid answer with real
 * zeroes, not a missing resource. The empty state the client renders is driven
 * by `brewCount === 0`, so it has one shape to handle rather than two.
 */
export function createStatsRoutes(service: BrewService): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/stats', async (c) => c.json(await service.stats()));
}
