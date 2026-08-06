#!/usr/bin/env node
/**
 * Applies `supabase/migrations/*.sql` in order to the database in DATABASE_URL,
 * then optionally `supabase/seed.sql`.
 *
 * Supabase's own CLI does this in production. This exists so CI and local
 * development can apply exactly the same files to a plain Postgres container
 * without needing the CLI, Docker-in-Docker, or a Supabase project — which is
 * what makes the migrations testable at all before a database is connected.
 *
 *   DATABASE_URL=postgres://... node scripts/apply-migrations.mjs [--seed]
 *
 * Each file runs inside its own transaction, and the filename is recorded in
 * `crema_migrations.applied` inside that same transaction. Two consequences,
 * both of which this script previously lacked:
 *
 *   - A failure leaves the database at the last *complete* migration, and the
 *     ledger says which one that was.
 *   - Running it again applies only what is new. Without the ledger every file
 *     was replayed from 0000, so the second run died on `create table` and the
 *     script only ever worked against a virgin database — which CI has, and a
 *     developer's machine has exactly once.
 *
 * The ledger records what ran, not what the file contained. Editing an applied
 * migration is still the thing you must not do; this makes the consequence
 * visible rather than preventing it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');
const SEED_FILE = join(import.meta.dirname, '..', 'supabase', 'seed.sql');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const withSeed = process.argv.includes('--seed');

// onnotice is overridden because `create extension if not exists` emits a
// NOTICE on every re-run, which is noise rather than information here.
const sql = postgres(connectionString, { max: 1, onnotice: () => undefined });

/**
 * The ledger itself, created before anything consults it.
 *
 * Not a migration, because a migration that records migrations has to exist
 * before the thing that would have applied it — and because it belongs to the
 * runner rather than to the schema.
 *
 * In its own schema rather than in `public`, and that is the same reasoning
 * stated in SQL. `public` is the application's schema: the drift guard asserts
 * every table there is declared in Drizzle, and `0007_rls.sql` asserts every
 * table there has row level security. Both are right to, and this table would
 * be an exception to each — which is the signal that it does not belong there.
 * Keeping it out also keeps it out of what Supabase exposes to an anon key.
 */
async function ensureLedger() {
  await sql`create schema if not exists crema_migrations`;
  await sql`
    create table if not exists crema_migrations.applied (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`;
}

async function appliedAlready() {
  const rows = await sql`select filename from crema_migrations.applied`;
  return new Set(rows.map((row) => row.filename));
}

/**
 * Runs one SQL file inside a transaction.
 *
 * `record` says whether to write the filename to the ledger, and only
 * migrations do. The seed is deliberately excluded: it is not a schema change,
 * it is meant to be re-runnable, and it clears its own rows before inserting.
 * Recording it would make the second `db:reset` fail on the ledger's primary
 * key — which is exactly what it did before this argument existed.
 */
async function run(label, statements, { record }) {
  const started = Date.now();
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(statements);

      // Inside the same transaction as the migration it describes. A migration
      // that ran but was not recorded would be replayed on the next
      // invocation, which is the failure the ledger exists to prevent.
      if (record) await tx`insert into crema_migrations.applied (filename) values (${label})`;
    });
    console.log(`  applied  ${label}  (${Date.now() - started}ms)`);
  } catch (error) {
    console.error(`  FAILED   ${label}`);
    console.error(`           ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

try {
  await ensureLedger();
  const applied = await appliedAlready();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const pending = files.filter((file) => !applied.has(file));

  if (files.length === 0) {
    console.log('No migrations to apply.');
  } else if (pending.length === 0) {
    console.log(`Up to date — all ${files.length} migration(s) already applied.`);
  } else {
    // Names the skipped ones rather than reporting only the work done, so a
    // run against an existing database says what it decided and why.
    if (applied.size > 0) console.log(`Skipping ${applied.size} already-applied migration(s).`);

    console.log(`Applying ${pending.length} migration(s):`);
    for (const file of pending) {
      await run(file, readFileSync(join(MIGRATIONS_DIR, file), 'utf8'), { record: true });
    }
  }

  if (withSeed) {
    console.log('Seeding:');
    // Not recorded: the seed is re-runnable by design and clears its own rows.
    await run('seed.sql', readFileSync(SEED_FILE, 'utf8'), { record: false });
  }

  console.log('Done.');
} catch {
  process.exitCode = 1;
} finally {
  await sql.end();
}
