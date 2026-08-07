import { useIsOnline } from '../hooks/use-online';

/**
 * A standing notice that the app cannot reach the server.
 *
 * A banner and not a toast, because this is a condition rather than an event.
 * A toast says something happened and then leaves; being offline is a state the
 * reader is still in, and a message that expired four seconds ago would leave
 * them wondering why the next thing they did seemed to do nothing.
 *
 * The claim it makes is a real one, not reassurance. React Query pauses
 * mutations while offline and resumes them on reconnect, and the optimistic
 * update has already been applied by then — so a brew logged on a train really
 * does save itself when the signal returns. There is a test for that, because
 * telling someone their work is safe is not a thing to assert untested.
 */
export function OfflineBanner() {
  const online = useIsOnline();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Connection"
      className="border-control-edge bg-sunken text-ink text-small flex items-center gap-2 rounded-xl border px-4 py-2.5"
    >
      <span aria-hidden="true" className="text-ink-muted">
        ⚠
      </span>
      <p>You are offline. Changes are kept and sent when the connection comes back.</p>
    </div>
  );
}
