import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

/**
 * A Postgres connection, built only when something asks for one.
 *
 * Nothing imports this at module scope. v1 runs `DATA_SOURCE=memory`, and a
 * pool that opens itself on import would turn "the database is not wired up
 * yet" into a connection error on every cold start of a deployment that has no
 * database. The repository factory calls this, and only in the branch that
 * needs it.
 */

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  /** Drains the pool. Deployments never call this; tests always do. */
  close: () => Promise<void>;
}

/**
 * One pool per connection string, shared by everything in this process.
 *
 * The repository factory and the rate-limit store both need a database, and a
 * serverless instance that opened a pool for each would hold twice the
 * connections to answer the same requests — Postgres runs out of those long
 * before it runs out of anything else. Keyed by the string rather than held as
 * a single value so a test pointing somewhere else cannot poison the handle
 * the next test reads.
 *
 * Nothing closes these; the instance's death does. Tests that need to drain a
 * pool build their own with `createDatabase`.
 */
const shared = new Map<string, DatabaseHandle>();

export function sharedDatabase(connectionString: string): Database {
  let handle = shared.get(connectionString);

  if (!handle) {
    handle = createDatabase(connectionString);
    shared.set(connectionString, handle);
  }

  return handle.db;
}

export function createDatabase(connectionString: string): DatabaseHandle {
  const client = postgres(connectionString, {
    // Serverless functions are short-lived and many; a large pool per instance
    // exhausts Postgres long before it helps.
    max: 5,
    // NOTICE output is not application logging and should not look like it.
    onnotice: () => undefined,
  });

  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
