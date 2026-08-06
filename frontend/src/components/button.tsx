import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * The four buttons this app has.
 *
 * Four, and not a variant system with nine options and a size scale — the
 * wireframes contain a solid pill, a destructive pill, a quiet dismissal and an
 * icon control, and a fifth would be a decision nobody has had to make yet.
 *
 * `primary` is the solid contrast pill from the wireframe rather than the crema
 * accent. The accent is spent on the rating dial, which is the thing worth
 * looking at; a page where the accent is also every button is a page where it
 * points at nothing.
 */

type Variant = 'primary' | 'danger' | 'quiet' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'rounded-pill bg-ink-strong text-surface px-6 py-2.5 text-body font-medium hover:opacity-90',
  danger:
    'rounded-pill bg-danger text-danger-ink px-6 py-2.5 text-body font-medium hover:opacity-90',
  quiet: 'rounded-pill text-ink-muted hover:text-ink px-4 py-2.5 text-body font-medium',
  icon: 'rounded-pill text-ink-muted hover:text-ink hover:bg-sunken grid size-10 place-items-center',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      // `type` defaults to "submit" inside a form, which is how a Cancel button
      // ends up saving the record. Callers override it where they mean to.
      type="button"
      className={`cursor-pointer transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
