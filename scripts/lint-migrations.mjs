#!/usr/bin/env node
/**
 * Migration linter.
 *
 * Applied migrations cannot be edited — once a file has run against a database,
 * changing it means the database and the repository disagree forever. So the
 * cheap checks have to happen before the file is merged, not after.
 *
 * Checks, in order of how expensive the mistake is to undo:
 *   1. Filenames are `NNNN_snake_case_name.sql`, so ordering is unambiguous.
 *   2. Sequence numbers are unique and contiguous — a duplicate or a gap means
 *      two branches wrote migrations in parallel and one needs renumbering.
 *   3. Files are not empty.
 *   4. Statements are terminated.
 *   5. Destructive statements carry a comment explaining the intent.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');
const FILENAME = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const DESTRUCTIVE = /\b(drop\s+(table|column|schema|database)|truncate)\b/i;

const problems = [];
const fail = (file, message) => problems.push(`${file}: ${message}`);

let files = [];
try {
  files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
} catch {
  console.log('No supabase/migrations directory yet — nothing to lint.');
  process.exit(0);
}

if (files.length === 0) {
  console.log('No migrations yet — nothing to lint.');
  process.exit(0);
}

const seen = new Map();

for (const file of files) {
  const match = FILENAME.exec(file);

  if (!match) {
    fail(file, 'filename must look like 0001_add_brews_table.sql');
    continue;
  }

  const sequence = match[1];
  if (seen.has(sequence)) {
    fail(file, `duplicate sequence number ${sequence}, already used by ${seen.get(sequence)}`);
  }
  seen.set(sequence, file);

  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  const meaningful = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();

  if (meaningful.length === 0) {
    fail(file, 'contains no statements');
    continue;
  }

  if (!meaningful.endsWith(';')) {
    fail(file, 'last statement is not terminated with a semicolon');
  }

  if (DESTRUCTIVE.test(meaningful) && !sql.includes('--')) {
    fail(file, 'contains a destructive statement with no comment explaining why');
  }
}

const numbers = [...seen.keys()].map(Number).sort((a, b) => a - b);
for (let i = 1; i < numbers.length; i += 1) {
  if (numbers[i] !== numbers[i - 1] + 1) {
    problems.push(
      `sequence gap between ${String(numbers[i - 1]).padStart(4, '0')} and ` +
        `${String(numbers[i]).padStart(4, '0')} — renumber so the order is unambiguous`,
    );
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} migration problem(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(`${files.length} migration(s) checked, all valid.`);
