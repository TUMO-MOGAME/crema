import { brewMethodLabel, formatBrewRatio, type Brew } from '@crema/shared';
import { RatingDial } from './rating-dial';

/**
 * One brew, as wireframe 1 draws it: the rating badge, the beans, a row of
 * pills carrying method and doses, and an edit control on the right.
 *
 * Rows are separated by hairlines rather than boxed as cards. That is what the
 * wireframe shows and it is also correct — this is a list to be read down, and
 * card chrome around every entry would put twelve borders on screen to no end.
 *
 * The ratio is the one thing here the wireframe does not draw. It earns its
 * place because it is the number brewers actually compare, and it is set
 * quietly at the end of the row rather than as a fourth pill, so the three
 * pills stay the three pills.
 *
 * Tasting notes are deliberately not here. They were, briefly, and they made
 * every row two lines taller for prose nobody reads while scanning — the list
 * answers "which brew", and the notes are one tap away in the dialog that
 * answers "why".
 */

interface BrewRowProps {
  brew: Brew;
  onEdit: (brew: Brew) => void;
  /** Position in the list, for the staggered settle on first paint. */
  index: number;
}

export function BrewRow({ brew, onEdit, index }: BrewRowProps) {
  return (
    <li
      className="border-hairline animate-row-settle border-b"
      // Capped so a long log does not spend two seconds dealing itself out.
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-center gap-4 py-4">
        <RatingDial rating={brew.rating} />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Wraps rather than truncates. The beans are how you tell one brew
              from another, and "Ethiopian Yirgache…" twice in a row tells you
              nothing at exactly the width where it matters most. */}
          <h3 className="text-ink-strong text-row font-semibold tracking-tight text-balance">
            {brew.beans}
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <Pill>{brewMethodLabel(brew.method)}</Pill>
            <Pill>
              <span aria-hidden="true">☕</span>
              <span className="tabular">{brew.coffeeGrams}g</span>
              <span className="sr-only">coffee</span>
            </Pill>
            <Pill>
              <span aria-hidden="true">💧</span>
              <span className="tabular">{brew.waterGrams}g</span>
              <span className="sr-only">water</span>
            </Pill>

            {/* Pushed right only where there is room. At 320 the pills already
                wrap, and a ratio pinned to the far edge would sit alone on a
                line looking like it belonged to the next brew. */}
            <span className="tabular text-micro text-ink-muted sm:ml-auto sm:pl-2">
              {formatBrewRatio(brew.coffeeGrams, brew.waterGrams)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onEdit(brew)}
          // Named, not just an icon: "Edit" alone in a list of twelve tells a
          // screen reader nothing about which one it would open.
          aria-label={`Edit ${brew.beans}`}
          className="text-ink-muted hover:text-ink hover:bg-sunken grid size-10 shrink-0 cursor-pointer place-items-center rounded-full transition-colors"
        >
          <EditIcon />
        </button>
      </div>
    </li>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-hairline rounded-pill text-small text-ink inline-flex items-center gap-1.5 border px-3 py-1">
      {children}
    </span>
  );
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  );
}
