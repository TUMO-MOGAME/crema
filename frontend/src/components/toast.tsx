import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { DISMISS_AFTER_MS, ToastContext, type Toast, type ToastTone } from './toast-context';

/**
 * Brief messages about something that already happened.
 *
 * These exist because of optimistic updates, not alongside them. When a change
 * is applied to the screen before the server has agreed, a refusal has to undo
 * it — and an undo with no explanation is a row that vanishes and comes back on
 * its own, which reads as a bug rather than as a failed save. The toast is what
 * turns that back into an answer.
 *
 * Deliberately small: a message, a tone, and a way to dismiss it. No queue
 * positions, no actions, no promise integration. The app has three mutations
 * and every one of them wants the same thing said in the same place.
 *
 * The context and the hook live in `toast-context.ts`, so this module exports
 * components only and Fast Refresh keeps working.
 *
 * Announcing correctly is the part worth being careful about. There are two
 * live regions rather than one, because `polite` and `assertive` are different
 * elements and a message moved between them may not be announced at all. Both
 * exist from first render and stay empty, since a live region added to the page
 * at the same moment as its content is a region screen readers were not
 * watching yet.
 */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      // A counter rather than a timestamp: two toasts raised in the same
      // millisecond would share a key, and React would render one of them.
      const id = nextId();
      setToasts((current) => [...current, { id, message, tone }]);

      setTimeout(() => {
        dismiss(id);
      }, DISMISS_AFTER_MS[tone]);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

let counter = 0;
const nextId = () => (counter += 1);

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      // Bottom on small screens where the thumb is, and out of the way of the
      // dialogs, which are centred. `pointer-events-none` on the container so
      // an expired toast's space never swallows a click meant for the list.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    >
      {(['info', 'danger'] as const).map((tone) => (
        <div
          key={tone}
          // Present from first render and empty until needed. A region created
          // at the same moment as its message is often not announced.
          role={tone === 'danger' ? 'alert' : 'status'}
          aria-live={tone === 'danger' ? 'assertive' : 'polite'}
          // Named, because these are not the only live regions on the page —
          // the list has a status of its own and the failed-to-load state is
          // an alert. Without names, "the alert" is ambiguous to a screen
          // reader user moving by landmark and to anything querying by role.
          aria-label={tone === 'danger' ? 'Errors' : 'Notifications'}
          className="contents"
        >
          {toasts
            .filter((toast) => toast.tone === tone)
            .map((toast) => (
              <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
      ))}
    </div>
  );
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'bg-raised text-ink border-control-edge',
  // The border carries the tone as well as the text colour, so the difference
  // between a confirmation and a failure is not colour alone.
  danger: 'bg-raised text-danger border-danger',
};

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  return (
    <div
      className={`rounded-card animate-toast-in text-body pointer-events-auto flex w-full max-w-sm items-start gap-3 border px-4 py-3 shadow-lg ${TONE_CLASS[toast.tone]}`}
    >
      <p className="flex-1">{toast.message}</p>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="text-ink-muted hover:text-ink -m-1 shrink-0 cursor-pointer rounded-full p-1 leading-none transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
