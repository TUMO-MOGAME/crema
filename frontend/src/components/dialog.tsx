import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal, on the platform's own `<dialog>`.
 *
 * `showModal()` brings focus trapping, Escape to dismiss, the top layer, a
 * backdrop, and `inert` on everything behind it — all of which a hand-rolled
 * modal has to reimplement and usually gets half right. The whole accessibility
 * story here is one method call, which is a better trade than a dependency.
 *
 * The close button is the wireframe's ✕. The backdrop closes too, because a
 * modal that can only be dismissed by finding the right control is a modal that
 * traps people.
 *
 * Two things about how this mounts, and the second one took a bug to get right.
 *
 * The `<dialog>` element itself is always rendered and is opened and closed
 * through `showModal()` and `close()`. Returning `null` while closed looks
 * equivalent and is not: React removes the node before the effect can run, so
 * `close()` was never reached, and the browser never did the thing it does on
 * close — put focus back where it came from. Focus fell to `<body>`, which for
 * anyone navigating by keyboard means losing their place in the list every time
 * they dismiss a dialog.
 *
 * The *contents* are still conditional, so a closed dialog holds no stale form
 * state and no heading that a query could find. The element is the part that
 * has to persist; what is inside it does not.
 */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // Generated, not a constant: the delete confirmation opens on top of the edit
  // form, so two dialogs are in the document at once. A shared id would put the
  // same one on both and leave `aria-labelledby` pointing at whichever the
  // browser found first — the wrong title, announced for the wrong dialog.
  const titleId = useId();

  /**
   * Where focus was before this dialog took it.
   *
   * Recorded on the way in and restored on the way out, rather than left to the
   * platform. `close()` does restore focus, but only to whatever the element
   * recorded when it opened — and the control that closes a dialog is usually
   * inside it, so by the time the effect runs, React has already unmounted the
   * focused button and focus has fallen to `<body>`. Doing it here is
   * deterministic, and it is the same answer in the browsers that never
   * implemented the native restoration.
   */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();

      // Only if it is still on the page and can take focus. Deleting a brew
      // removes the row whose Edit button opened the dialog, and focusing a
      // detached node silently does nothing.
      const previous = returnFocusTo.current;
      returnFocusTo.current = null;

      if (previous?.isConnected) previous.focus();
    }
  }, [open]);

  // A dialog removed from the page while still open would leave the document
  // inert behind a modal that is no longer there.
  useEffect(() => {
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      // Only while there is a title element to point at. A closed dialog has no
      // contents, so an `aria-labelledby` here would reference nothing and give
      // the element a broken accessible name rather than no name at all.
      {...(open ? { 'aria-labelledby': titleId } : {})}
      // Escape fires `cancel` before `close`; both route to the same handler so
      // the parent's state cannot drift out of step with the element's.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      // A click that lands on the element itself rather than its contents is a
      // click on the backdrop — the dialog box is the padded child inside.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="bg-raised text-ink rounded-card animate-dialog-in m-auto w-[min(32rem,calc(100vw-2rem))] p-0 backdrop:cursor-pointer"
    >
      {open && (
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2
              id={titleId}
              className="font-display text-ink-strong text-2xl font-semibold tracking-tight"
            >
              {title}
            </h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-muted hover:text-ink hover:bg-sunken -m-2 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-xl leading-none transition-colors"
            >
              ✕
            </button>
          </div>

          {children}
        </div>
      )}
    </dialog>
  );
}
