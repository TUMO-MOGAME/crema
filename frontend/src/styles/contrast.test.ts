import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The contrast the design system actually delivers, measured from the tokens
 * themselves.
 *
 * Colour is the one part of a design system that cannot be checked by reading
 * it. Every value here was chosen deliberately and several of them were wrong:
 * the rating dial's number sat at 2.65:1 in the light theme, the form error
 * text at 3.92:1 in the dark one, and the border that is the only thing drawing
 * a select at 1.31:1 — while the comment above it said the ramp had been
 * darkened to keep its contrast. A number nobody computes is an intention.
 *
 * This parses `index.css` rather than restating the values, so a token edited
 * without checking fails here rather than shipping.
 */

const CSS = readFileSync(join(import.meta.dirname, 'index.css'), 'utf8');

/** WCAG 2.2, for the sizes this app actually uses. */
const NORMAL_TEXT = 4.5;
const NON_TEXT = 3; // 1.4.11: control boundaries and meaningful graphics.

type Oklch = [l: number, c: number, h: number];

/**
 * OKLCH to linear sRGB, then to a relative luminance.
 *
 * Written out rather than pulled in, because a colour library would be a
 * dependency shipped to users for the sake of a test.
 */
function linearRgb([L, C, H]: Oklch): [number, number, number] {
  const hue = (H * Math.PI) / 180;
  const a = C * Math.cos(hue);
  const b = C * Math.sin(hue);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function contrast(foreground: Oklch, background: Oklch): number {
  const luminance = (colour: Oklch) => {
    const [r, g, b] = linearRgb(colour);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * A custom property's value, resolved one level through the palette.
 *
 * The themes are written as `--ui-ink: var(--color-bean-100)`, so reading a
 * semantic token means following it to the palette entry it points at.
 * `scope` picks which theme block to read, since every name is declared twice.
 */
function token(name: string, scope: 'dark' | 'light'): Oklch {
  const block = themeBlock(scope);
  const declaration = new RegExp(`${name}:\\s*([^;]+);`).exec(block);

  if (!declaration?.[1]) throw new Error(`No ${name} declared in the ${scope} theme.`);

  const value = declaration[1].trim();
  const reference = /^var\((--[\w-]+)\)$/.exec(value);

  return reference?.[1] ? palette(reference[1]) : parseOklch(value, name);
}

/**
 * The theme's declarations. Dark is `:root`, light is the explicit
 * `[data-theme='light']` block — the media query duplicates the latter, and a
 * separate test asserts the two agree.
 */
function themeBlock(scope: 'dark' | 'light'): string {
  const start =
    scope === 'dark' ? CSS.indexOf(':root {') : CSS.indexOf(":root[data-theme='light'] {");
  const block = CSS.slice(start, CSS.indexOf('}', start));

  if (!block) throw new Error(`Could not find the ${scope} theme block.`);
  return block;
}

function palette(name: string): Oklch {
  const declaration = new RegExp(`${name}:\\s*(oklch\\([^)]+\\))`).exec(CSS);
  if (!declaration?.[1]) throw new Error(`No palette entry ${name}.`);

  return parseOklch(declaration[1], name);
}

function parseOklch(value: string, name: string): Oklch {
  const parts = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value);
  if (!parts) throw new Error(`${name} is not a plain oklch() value: ${value}`);

  return [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}

/**
 * Every pairing the UI actually renders, and what each one has to clear.
 *
 * Only real pairings — a matrix of every token against every other would be
 * longer and would assert things no screen shows.
 */
const PAIRINGS: {
  what: string;
  foreground: string;
  background: string;
  minimum: number;
}[] = [
  // Body copy and headings.
  {
    what: 'ink on the page',
    foreground: '--ui-ink',
    background: '--ui-surface',
    minimum: NORMAL_TEXT,
  },
  {
    what: 'ink on a dialog',
    foreground: '--ui-ink',
    background: '--ui-raised',
    minimum: NORMAL_TEXT,
  },
  {
    what: 'strong ink on the page',
    foreground: '--ui-ink-strong',
    background: '--ui-surface',
    minimum: NORMAL_TEXT,
  },
  // The muted token carries the ratio at 11px and the Cancel button's label.
  {
    what: 'muted ink on the page',
    foreground: '--ui-ink-muted',
    background: '--ui-surface',
    minimum: NORMAL_TEXT,
  },
  {
    what: 'muted ink on a dialog',
    foreground: '--ui-ink-muted',
    background: '--ui-raised',
    minimum: NORMAL_TEXT,
  },
  // Validation messages live inside the dialog.
  {
    what: 'error text on a dialog',
    foreground: '--ui-danger',
    background: '--ui-raised',
    minimum: NORMAL_TEXT,
  },
  {
    what: 'error text on the page',
    foreground: '--ui-danger',
    background: '--ui-surface',
    minimum: NORMAL_TEXT,
  },
  // The Delete button.
  {
    what: 'the delete label on its pill',
    foreground: '--ui-danger-ink',
    background: '--ui-danger-surface',
    minimum: NORMAL_TEXT,
  },
  // The primary button is strong ink as a fill, with the page colour on it.
  {
    what: 'the primary button label',
    foreground: '--ui-surface',
    background: '--ui-ink-strong',
    minimum: NORMAL_TEXT,
  },
  // Non-text: the boundary of a control, and the focus ring.
  {
    what: 'a control edge against the page',
    foreground: '--ui-control-edge',
    background: '--ui-surface',
    minimum: NON_TEXT,
  },
  {
    what: 'a control edge against a dialog',
    foreground: '--ui-control-edge',
    background: '--ui-raised',
    minimum: NON_TEXT,
  },
  {
    what: 'the focus ring against the page',
    foreground: '--ui-accent',
    background: '--ui-surface',
    minimum: NON_TEXT,
  },
];

describe.each(['dark', 'light'] as const)('the %s theme', (scope) => {
  it.each(PAIRINGS)('gives $what at least $minimum:1', ({ foreground, background, minimum }) => {
    const ratio = contrast(token(foreground, scope), token(background, scope));

    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(minimum);
  });

  /**
   * The arc, not the number. The number is `ink-strong` and is covered above;
   * these five carry the rating as a graphical object, so 3:1 is the bar — and
   * it is a bar every step has to clear, because which one a reader sees is
   * decided by how good their coffee was.
   */
  it.each([1, 2, 3, 4, 5])(`draws the rating-%i arc at ${NON_TEXT}:1 or better`, (rating) => {
    const ratio = contrast(token(`--ui-extraction-${rating}`, scope), token('--ui-surface', scope));

    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(NON_TEXT);
  });

  /** A ramp that does not climb is a set of five colours. */
  it('runs the extraction ramp in one direction', () => {
    const lightness = [1, 2, 3, 4, 5].map((step) => token(`--ui-extraction-${step}`, scope)[0]);
    const ordered = scope === 'dark' ? [...lightness].sort((a, b) => a - b) : [...lightness].sort((a, b) => b - a); // prettier-ignore

    expect(lightness).toEqual(ordered);
  });
});

/**
 * The light theme is declared twice — once under `prefers-color-scheme` for
 * readers who have not chosen, and once under `[data-theme='light']` for those
 * who have. Two copies of the same values is two places to edit, so this
 * asserts they have not drifted.
 */
it('declares the same light theme for the media query and the explicit choice', () => {
  const declarations = (block: string) =>
    [...block.matchAll(/(--ui-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => `${name}: ${value}`);

  const mediaQueryStart = CSS.indexOf(":root:not([data-theme='dark'])");
  const mediaQueryBlock = CSS.slice(mediaQueryStart, CSS.indexOf('}', mediaQueryStart));

  expect(declarations(mediaQueryBlock)).toEqual(declarations(themeBlock('light')));
});

/** Every semantic variable must be exposed as a utility, or nothing can use it. */
it('exposes each theme variable through the token layer', () => {
  const inlineStart = CSS.indexOf('@theme inline');
  const inlineBlock = CSS.slice(inlineStart, CSS.indexOf('}', inlineStart));

  for (const name of ['--ui-control-edge', '--ui-danger-surface', '--ui-danger', '--ui-surface']) {
    expect(inlineBlock, `${name} is themed but has no utility`).toContain(`var(${name})`);
  }
});

/** The dial's animation hard-codes the circumference the component computes. */
it('keeps the dial sweep in step with the radius the component draws', () => {
  const declared = /--dial-circumference:\s*([\d.]+)/.exec(CSS)?.[1];

  // `RADIUS = 21` in rating-dial.tsx.
  expect(Number(declared)).toBeCloseTo(2 * Math.PI * 21, 1);
});
