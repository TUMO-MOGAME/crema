import { env, type Env } from '../config/env.js';
import { sharedDatabase } from '../db/client.js';
import type { BrewRepository } from './brew.repository.js';
import { DrizzleBrewRepository } from './drizzle-brew.repository.js';
import { InMemoryBrewRepository } from './in-memory-brew.repository.js';
import { seedBrewInputs } from './seed-brews.js';

/**
 * The one place that decides which adapter the app runs on.
 *
 * This function is the whole of "turning on Supabase later": set `DATA_SOURCE`
 * and `DATABASE_URL` in the deployment, apply the migrations, redeploy. No
 * route, service or test changes, because nothing above this line has ever seen
 * anything but the `BrewRepository` interface.
 */
export function createBrewRepository(config: Env = env): BrewRepository {
  if (config.DATA_SOURCE === 'postgres') {
    // The env loader already refuses this combination, so reaching here without
    // a URL means something bypassed it. Restated rather than asserted away,
    // because the alternative is a connection string of `undefined`.
    if (!config.DATABASE_URL) {
      throw new Error('DATABASE_URL is required when DATA_SOURCE is "postgres".');
    }

    // The shared pool, not a private one: the rate-limit store reads the same
    // database, and a serverless instance holding two pools to answer one
    // request would exhaust Postgres connections at half the load.
    return new DrizzleBrewRepository(sharedDatabase(config.DATABASE_URL));
  }

  // Seeded, because an empty list is a worse first impression than a demo one
  // and the wireframe brews are what the design is meant to be checked against.
  return new InMemoryBrewRepository(seedBrewInputs());
}

export type { BrewFilter, BrewRepository } from './brew.repository.js';
