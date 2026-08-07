import { createContext, useContext } from 'react';

/**
 * The toast context and the hook that reads it.
 *
 * Split from `toast.tsx` rather than sitting beside the provider, because a
 * module that exports both components and other values defeats Fast Refresh —
 * editing the hook would remount the tree instead of hot-swapping it. The lint
 * rule that says so is right, and the fix is one file rather than an exception.
 */

export type ToastTone = 'info' | 'danger';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/** How long a message stays. Failures linger, because they may need acting on. */
export const DISMISS_AFTER_MS: Record<ToastTone, number> = {
  info: 4000,
  danger: 8000,
};

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);

  // Throwing rather than returning a no-op: a toast that silently does nothing
  // is a failure the user never hears about, which is the thing this exists to
  // prevent.
  if (!value) throw new Error('useToast must be used inside a ToastProvider.');

  return value;
}
