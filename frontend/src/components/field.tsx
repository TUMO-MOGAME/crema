import { useId, type ReactNode } from 'react';

/**
 * A labelled control with its error message.
 *
 * The label is a real `<label>` bound by id, not a placeholder pretending to be
 * one: a placeholder disappears the moment someone types, which is exactly when
 * they need to know what they are filling in.
 *
 * The error is wired through `aria-describedby` and `aria-invalid`, so a screen
 * reader hears why the form refused rather than only seeing red text. It is
 * rendered in a fixed slot so the layout does not jump as messages appear.
 */

interface FieldProps {
  label: string;
  error?: string | undefined;
  /**
   * A small marker beside the label — the quick-log "inferred" chip. Part of
   * `aria-describedby`, so a reader landing on the control hears the marker and
   * not only sees it.
   */
  badge?: string | undefined;
  /** Receives the ids to bind. */
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

export function Field({ label, error, badge, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const badgeId = `${id}-badge`;

  const describedBy =
    [badge ? badgeId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-small text-ink-muted font-medium">
          {label}
        </label>

        {badge && (
          <span
            id={badgeId}
            className="bg-accent text-accent-ink rounded-pill px-2 py-px text-micro font-medium"
          >
            {badge}
          </span>
        )}
      </div>

      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
      })}

      {/*
        Described by, not announced.

        This used to be an `aria-live` region *and* the `aria-describedby`
        target, so a message was read once when it appeared and again when the
        field took focus. Validation here is `onTouched` — the error arrives as
        focus leaves the field and the reader is already moving — so the
        description is the useful half and the announcement was the repeat.
      */}
      <p id={errorId} className="text-small text-danger min-h-[1.125rem]">
        {error}
      </p>
    </div>
  );
}

/**
 * Shared control styling, so an input and a select cannot drift apart.
 *
 * `data-inferred` marks a control holding a value the model guessed rather than
 * was told — the accent border is the visual half of the chip the label wears.
 */
export const CONTROL_CLASS =
  'bg-surface border-control-edge text-ink placeholder:text-ink-muted w-full rounded-xl border px-4 py-2.5 text-body transition-colors aria-[invalid=true]:border-danger data-inferred:border-accent';
