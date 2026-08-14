import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The light theme is declared twice, and this test is the reason that is safe.
 *
 * CSS offers no way to say "these two selectors share this block": the media
 * query covers a reader whose system asks for light, and `[data-theme='light']`
 * covers one who pressed the toggle. Both must be the same theme — a token
 * edited in one block and not the other ships a bug visible only to users of
 * one mechanism, which is exactly the kind of drift nobody reproduces from a
 * report. So the duplication stays, and this asserts it is a copy.
 */

const CSS = readFileSync(join(import.meta.dirname, 'index.css'), 'utf8');

/** Every `--ui-*` declaration inside the block that follows `marker`. */
function themeTokens(marker: string): Record<string, string> {
  const at = CSS.indexOf(marker);
  expect(at, `expected index.css to contain ${marker}`).toBeGreaterThan(-1);

  const open = CSS.indexOf('{', at);
  let depth = 1;
  let close = open + 1;

  while (depth > 0 && close < CSS.length) {
    if (CSS[close] === '{') depth += 1;
    if (CSS[close] === '}') depth -= 1;
    close += 1;
  }

  const block = CSS.slice(open + 1, close);
  const tokens: Record<string, string> = {};

  for (const match of block.matchAll(/(--ui-[\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]!] = match[2]!.replace(/\s+/g, ' ').trim();
  }

  return tokens;
}

describe('the light theme', () => {
  it('says the same thing to the system preference and to the toggle', () => {
    const viaMediaQuery = themeTokens(":root:not([data-theme='dark'])");
    const viaToggle = themeTokens(":root[data-theme='light']");

    // Non-empty first: two empty objects would also be equal, and would mean
    // the markers stopped matching rather than that the themes agree.
    expect(Object.keys(viaMediaQuery).length).toBeGreaterThan(0);
    expect(viaToggle).toEqual(viaMediaQuery);
  });
});
