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
