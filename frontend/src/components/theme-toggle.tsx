import { useState } from 'react';
import { applyTheme, nextTheme, readTheme, type Theme } from '../lib/theme';

const LABELS: Record<Theme, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

const ICONS: Record<Theme, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

/**
 * One control cycling system → light → dark.
 *
 * The label says which theme is active, not which one the button would switch
 * to — a control that describes a state you cannot see is a riddle. The title
 * spells out the next step for anyone who wants it.
 */
export function ThemeToggle() {
  // A lazy initialiser, not an effect that sets state after mount: reading
  // storage during the first render means the label is right immediately,
  // rather than showing "Match system" for a frame and then correcting itself.
  const [theme, setTheme] = useState<Theme>(readTheme);

  const change = () => {
    const next = nextTheme(theme);
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={change}
      title={`Theme: ${LABELS[theme]}. Switch to ${LABELS[nextTheme(theme)]}.`}
      className="border-control-edge text-ink-muted hover:text-ink hover:bg-sunken text-small flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 transition-colors"
    >
      <span aria-hidden="true">{ICONS[theme]}</span>
      <span className="sr-only">Theme: </span>
      {LABELS[theme]}
    </button>
  );
}
