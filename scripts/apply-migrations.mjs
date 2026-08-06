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
 * Each file runs inside its own transaction, so a failure leaves the database
 * at the last complete migration rather than half way through a broken one.
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

async function run(label, statements) {
  const started = Date.now();
  try {
    await sql.begin((tx) => [tx.unsafe(statements)]);
    console.log(`  applied  ${label}  (${Date.now() - started}ms)`);
  } catch (error) {
    console.error(`  FAILED   ${label}`);
    console.error(`           ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

try {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migrations to apply.');
  } else {
    console.log(`Applying ${files.length} migration(s):`);
    for (const file of files) {
      await run(file, readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    }
  }

  if (withSeed) {
    console.log('Seeding:');
    await run('seed.sql', readFileSync(SEED_FILE, 'utf8'));
  }

  console.log('Done.');
} catch {
  process.exitCode = 1;
} finally {
  await sql.end();
}
