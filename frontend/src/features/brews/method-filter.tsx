import type { BrewMethod, BrewMethodSlug } from '@crema/shared';

/**
 * The method filter from wireframe 1.
 *
 * The options come from `/api/brew-methods` rather than a constant in this
 * file, which is the reason that endpoint exists: the vocabulary lives in one
 * place, and a method added by a migration appears here without a frontend
 * change.
 *
 * "All methods" is the empty value, and the API reads an empty `method` as no
 * filter — so clearing the dropdown and never having touched it send the same
 * request.
 */

interface MethodFilterProps {
  methods: BrewMethod[];
  value: BrewMethodSlug | '';
  onChange: (value: BrewMethodSlug | '') => void;
}

export function MethodFilter({ methods, value, onChange }: MethodFilterProps) {
  return (
    <div className="relative">
      <label htmlFor="method-filter" className="sr-only">
        Filter by method
      </label>

      <select
        id="method-filter"
        value={value}
        onChange={(event) => onChange(event.target.value as BrewMethodSlug | '')}
        className="border-control-edge rounded-pill bg-surface text-ink text-body w-full cursor-pointer appearance-none border px-5 py-3 pr-12"
      >
        {/*
          "All methods", not "Filter by method".

          The empty option used to repeat the label, which read as the control
          announcing itself twice to a screen reader and, once a filter was set,
          offered a way back that named the control rather than the state it
          would return to. This also matches what the empty state calls the same
          action — "Show all methods" — so the two are recognisably one idea.
        */}
        <option value="">All methods</option>
        {methods.map((method) => (
          <option key={method.slug} value={method.slug}>
            {method.label}
          </option>
        ))}
      </select>

      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-ink-muted pointer-events-none absolute top-1/2 right-5 size-5 -translate-y-1/2"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
