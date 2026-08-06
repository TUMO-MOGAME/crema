import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

afterEach(() => {
  cleanup();
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
