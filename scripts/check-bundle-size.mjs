#!/usr/bin/env node
/**
 * Bundle size budget.
 *
 * Bundles do not get large in one commit; they get large in fifty commits that
 * each looked harmless. A budget turns that slow drift into a build failure on
 * the commit that actually caused it, while the cause is still obvious.
 *
 * Budgets are gzip sizes, which is what a user's connection actually carries.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS_DIR = join(import.meta.dirname, '..', 'frontend', 'dist', 'assets');

const BUDGETS_KB = {
  js: 250,
  css: 40,
};

let assets;
try {
  assets = readdirSync(ASSETS_DIR);
} catch {
  console.error('No frontend/dist/assets — run the frontend build first.');
  process.exit(1);
}

const totals = { js: 0, css: 0 };

for (const asset of assets) {
  const extension = asset.endsWith('.js') ? 'js' : asset.endsWith('.css') ? 'css' : null;
  if (!extension) continue;

  totals[extension] += gzipSync(readFileSync(join(ASSETS_DIR, asset))).length;
}

let failed = false;

for (const [extension, budgetKb] of Object.entries(BUDGETS_KB)) {
  const actualKb = totals[extension] / 1024;
  const used = Math.round((actualKb / budgetKb) * 100);
  const line = `${extension.padEnd(4)} ${actualKb.toFixed(1).padStart(7)} kB gzip / ${budgetKb} kB budget  (${used}%)`;

  if (actualKb > budgetKb) {
    console.error(`OVER  ${line}`);
    failed = true;
  } else {
    console.log(`ok    ${line}`);
  }
}

process.exit(failed ? 1 : 0);
