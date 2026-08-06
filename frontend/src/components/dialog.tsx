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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
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
    </dialog>
  );
}
