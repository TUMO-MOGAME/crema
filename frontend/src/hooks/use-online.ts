import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/**
 * Whether the app believes it can reach the network.
 *
 * Read from React Query's `onlineManager` rather than from `navigator.onLine`
 * directly, and that is the whole point of the hook. The query layer already
 * pauses mutations and queries when it thinks it is offline; if the banner
 * asked a different source, the two could disagree — the screen saying it is
 * connected while every request sits paused, or the reverse. One source means
 * the message and the behaviour cannot contradict each other.
 *
 * `useSyncExternalStore` rather than an effect and a piece of state, because
 * that is exactly what it is for: an external store with a subscribe function
 * and a way to read the current value.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    // Server-rendered or pre-hydration, assume connected. Announcing a problem
    // that may not exist is worse than staying quiet until there is evidence.
    () => true,
  );
}
