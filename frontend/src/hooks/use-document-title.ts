import { useEffect } from 'react';

/**
 * Keeps `document.title` in step with application state.
 *
 * The brief asks for a page title of `Brews: {brewCount}`, which means the tab
 * has to update as brews are added and removed — not just on first paint.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** The exact title format the brief specifies. */
export function brewCountTitle(brewCount: number): string {
  return `Brews: ${brewCount}`;
}
