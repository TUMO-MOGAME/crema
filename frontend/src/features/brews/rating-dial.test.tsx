import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RatingDial } from './rating-dial';

/**
 * The dial says the rating three times — number, colour, arc — so that no
 * reader depends on any one of them. These assert all three, because the whole
 * argument for replacing the wireframe's traffic light was that colour alone is
 * not enough.
 */

function arc(container: HTMLElement): SVGCircleElement {
  const circles = container.querySelectorAll('circle');
  // The second is the filled arc; the first is the unfilled track behind it.
  return circles[1] as unknown as SVGCircleElement;
}

describe('RatingDial', () => {
  it('shows the rating as a number', () => {
    render(<RatingDial rating={3} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('draws a fuller arc for a better brew', () => {
    const { container: low } = render(<RatingDial rating={1} />);
    const { container: high } = render(<RatingDial rating={5} />);

    const lowOffset = Number(arc(low).getAttribute('stroke-dashoffset'));
    const highOffset = Number(arc(high).getAttribute('stroke-dashoffset'));

    // Offset counts down as the arc fills, so a 5 leaves none of it undrawn.
    expect(highOffset).toBeLessThan(lowOffset);
    expect(highOffset).toBeCloseTo(0, 5);
  });

  it('draws no arc beyond full, whatever it is handed', () => {
    const { container } = render(<RatingDial rating={9} />);

    expect(Number(arc(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('never names a colour token that does not exist', () => {
    const { container } = render(<RatingDial rating={0} />);

    // A rating below the range would otherwise ask for --ui-extraction-0 and
    // render an invisible badge rather than an obviously broken one.
    expect(container.firstElementChild).toHaveStyle({ color: 'var(--ui-extraction-1)' });
  });

  it('walks the extraction scale rather than repeating one colour', () => {
    const colours = [1, 2, 3, 4, 5].map((rating) => {
      const { container } = render(<RatingDial rating={rating} />);
      return container.firstElementChild?.getAttribute('style');
    });

    expect(new Set(colours).size).toBe(5);
  });

  it('hides the decoration from assistive technology', () => {
    const { container } = render(<RatingDial rating={4} />);

    // The number is the accessible content; the rings are not read out twice.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
