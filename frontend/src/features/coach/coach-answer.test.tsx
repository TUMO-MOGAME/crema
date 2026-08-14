import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoachAnswer } from './coach-answer';

/**
 * The renderer, held to the subset it promises: the coach's own dialect of
 * markdown in, styled elements out, and nothing that reaches the DOM as
 * anything but text. The end-to-end case — deltas through the dialog — lives
 * in coach.test.tsx; these pin the parsing.
 */

describe('CoachAnswer', () => {
  it('renders a plain sentence as one paragraph', () => {
    render(<CoachAnswer text="Your best V60s sit around 1:16." />);

    const paragraph = screen.getByText('Your best V60s sit around 1:16.');
    expect(paragraph.tagName).toBe('P');
  });

  it('renders bold figures as bold, with the asterisks gone', () => {
    render(<CoachAnswer text="Your best V60 ratio is **1:16**, rated **5/5**." />);

    expect(screen.getByText('1:16').tagName).toBe('STRONG');
    expect(screen.getByText('5/5').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('renders italics and code the same way', () => {
    render(<CoachAnswer text="A *ristretto* pull, logged as `1:9`." />);

    expect(screen.getByText('ristretto').tagName).toBe('EM');
    expect(screen.getByText('1:9').tagName).toBe('CODE');
  });

  it('turns a dash comparison into a list, one item per line', () => {
    render(
      <CoachAnswer
        text={
          'Three ratios stand out:\n- **1:16** rated 5/5\n- **1:17** rated 4/5\n- **1:13** rated 2/5'
        }
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('1:16 rated 5/5');
    // The lead-in stays a paragraph above the list, not a fourth item.
    expect(screen.getByText('Three ratios stand out:').tagName).toBe('P');
  });

  it('numbers a numbered list', () => {
    render(<CoachAnswer text={'Try these in order:\n1. Coarser grind\n2. Cooler water'} />);

    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('splits on blank lines into separate paragraphs', () => {
    render(<CoachAnswer text={'The short answer is 1:16.\n\nYour tighter ratios scored worse.'} />);

    expect(screen.getByText('The short answer is 1:16.').tagName).toBe('P');
    expect(screen.getByText('Your tighter ratios scored worse.').tagName).toBe('P');
  });

  it('renders a heading the prompt forbade as a bold line, not hash marks', () => {
    render(<CoachAnswer text={'## Ratios\nThe spread is wide.'} />);

    expect(screen.getByText('Ratios')).toBeInTheDocument();
    expect(screen.queryByText(/#/)).not.toBeInTheDocument();
  });

  it('renders an unclosed bold at the stream edge as bold, not as asterisks', () => {
    // Mid-stream: the closer has not arrived yet. Two asterisks that flash
    // and vanish read as a glitch; bold-in-progress reads as an answer.
    render(<CoachAnswer text="Your best ratio is **1:1" />);

    expect(screen.getByText('1:1').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('shows markup-shaped text as text, because nothing here is HTML', () => {
    render(<CoachAnswer text={'Ignore this: <script>alert(1)</script>'} />);

    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
