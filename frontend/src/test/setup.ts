import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

afterEach(() => {
  cleanup();
});

/**
 * jsdom has no `matchMedia`, so anything asking about motion preference gets
 * `undefined` and has to guess.
 *
 * It answers "reduce" here, which is both the honest reading of a headless
 * environment — nothing is being animated because nothing is being drawn — and
 * the useful one: exit animations that a test waits out are wall-clock spent
 * proving a timer works. The test that is actually about the delay stubs this
 * the other way round, so the timed path is still covered rather than skipped.
 */
beforeEach(() => {
  if (typeof window.matchMedia === 'function') return;

  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

/**
 * jsdom implements `<dialog>` as an element but not as a modal — `showModal`
 * and `close` are simply absent, so anything that calls them throws.
 *
 * The dialogs use the native element deliberately: it brings focus trapping,
 * Escape, the top layer and `inert` on the background, which is a great deal of
 * accessibility for one method call. Rewriting it as a div to suit the test
 * environment would be the tail wagging the dog, so the environment is patched
 * instead. The shim only has to toggle `open` and fire `close`, which is the
 * part the components actually observe.
 */
beforeEach(() => {
  const dialog = window.HTMLDialogElement?.prototype;
  if (!dialog) return;

  if (typeof dialog.showModal !== 'function') {
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }

  if (typeof dialog.close !== 'function') {
    dialog.close = function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
});
