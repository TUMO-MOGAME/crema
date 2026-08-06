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
        className="border-hairline rounded-pill bg-surface text-ink text-body w-full cursor-pointer appearance-none border px-5 py-3 pr-12"
      >
        <option value="">Filter by method</option>
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
