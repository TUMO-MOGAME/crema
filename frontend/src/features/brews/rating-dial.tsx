import { BREW_LIMITS } from '@crema/shared';

/**
 * The rating, as a dial.
 *
 * The wireframe draws a coloured circle with the number in it, and this keeps
 * that exactly — same shape, same place, same size. What it does not keep is
 * red-amber-green, for two reasons. A brew is not passing or failing the way a
 * build is, and the scale that actually means something here is the drink: a 1
 * is pale, thin and ashy, a 5 is full crema. And red against green is the one
 * pairing a colour-blind reader cannot separate, which matters when the colour
 * is doing the scanning work down a list.
 *
 * So the value is said three times: the number, the warmth of the fill, and an
 * arc filled to `rating / 5` — the collar on a grinder, the needle on a scale.
 * Any one of the three, read alone, gives the right answer.
 */

const RADIUS = 21;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface RatingDialProps {
  rating: number;
  /** The sweep plays on first paint. Rows added later appear at their value. */
  animate?: boolean;
}

export function RatingDial({ rating, animate = true }: RatingDialProps) {
  const value = clampRating(rating);
  const swept = CIRCUMFERENCE - (value / BREW_LIMITS.ratingMax) * CIRCUMFERENCE;

  return (
    <span
      className="relative grid size-12 shrink-0 place-items-center"
      style={{ color: `var(--ui-extraction-${value})` }}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="var(--ui-hairline)"
          strokeWidth="2.5"
        />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={swept}
          className={animate ? 'animate-dial-sweep' : undefined}
        />
      </svg>

      <span className="tabular text-row relative font-semibold">{value}</span>
    </span>
  );
}

/**
 * The API validates this range, so an out-of-range value means something
 * upstream is wrong. Clamping keeps the arc from wrapping past full and the
 * colour from naming a token that does not exist, which would render an
 * invisible badge rather than an obviously broken one.
 */
function clampRating(rating: number): number {
  return Math.min(Math.max(Math.round(rating), BREW_LIMITS.ratingMin), BREW_LIMITS.ratingMax);
}
