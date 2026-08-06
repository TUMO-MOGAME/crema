/**
 * Theme choice, remembered.
 *
 * Three states, not two: light, dark, and "whatever the system says". Most
 * toggles collapse that third one, which quietly overrides a reader who has
 * already told their operating system what they want at 6am.
 *
 * The CSS does the work — `:root[data-theme]` and a `prefers-color-scheme`
 * query in `styles/index.css`. This only records the choice and stamps the
 * attribute.
 */

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'crema:theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    // Private browsing and blocked storage both throw here. Defaulting to the
    // system preference is the right answer anyway.
    return 'system';
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // Removing the attribute is what hands control back to the media query.
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A theme that cannot be remembered still has to be applied.
  }
}

/** The next theme in the cycle, so one control covers all three. */
export function nextTheme(current: Theme): Theme {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length] ?? 'system';
}
