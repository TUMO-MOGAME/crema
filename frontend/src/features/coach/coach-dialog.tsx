import { AI_LIMITS, type BrewProposal } from '@crema/shared';
import { useId, useState } from 'react';
import { Button } from '../../components/button';
import { Dialog } from '../../components/dialog';
import { CONTROL_CLASS } from '../../components/field';
import { CoachAnswer } from './coach-answer';
import { useCoach } from './use-coach';

/**
 * The Brew Coach — a question in, a streamed answer out, with the agent's work
 * shown rather than implied.
 *
 * The trace is the deliberate part of this screen. Every tool call the agent
 * made arrives as a one-line summary and is listed where the reader can see it,
 * because "I looked at your twelve V60s and your stats" is the difference
 * between advice and an oracle. It collapses once the answer is in, but it is
 * never absent.
 *
 * A proposal never saves itself. It renders as a card with one action — open
 * the Add form, pre-filled, marked as guessed — which is the same door every
 * brew enters by.
 */

interface CoachDialogProps {
  open: boolean;
  onClose: () => void;
  /** The reader chose to take the proposal into the Add form. */
  onProposal: (proposal: BrewProposal) => void;
}

export function CoachDialog({ open, onClose, onProposal }: CoachDialogProps) {
  const inputId = useId();
  const [question, setQuestion] = useState('');
  const coach = useCoach();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const asked = question.trim();
    if (asked && coach.status !== 'answering') void coach.ask(asked);
  };

  const close = () => {
    // Leaving mid-answer aborts the request — the disconnect travels down to
    // the model call, so an abandoned question stops costing tokens.
    coach.reset();
    setQuestion('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} title="Brew coach">
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-small text-ink-muted font-medium">
          Ask about your log
        </label>

        <div className="flex gap-2">
          <input
            id={inputId}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={AI_LIMITS.coachQuestionMaxLength}
            placeholder="What ratio gives me my best V60s?"
            autoComplete="off"
            className={CONTROL_CLASS}
          />

          <Button
            type="submit"
            disabled={coach.status === 'answering' || question.trim() === ''}
            className="shrink-0"
          >
            {coach.status === 'answering' ? 'Thinking…' : 'Ask'}
          </Button>
        </div>
      </form>

      {coach.trace.length > 0 && (
        <details open={coach.status === 'answering'} className="mt-4">
          <summary className="text-small text-ink-muted cursor-pointer font-medium">
            What the coach looked at ({coach.trace.length})
          </summary>
          <ul className="border-hairline mt-2 flex flex-col gap-1 border-l pl-3">
            {coach.trace.map((line, index) => (
              <li key={index} className="text-small text-ink-muted">
                {line.summary}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/*
        One region, `aria-live` off. Announcing a stream token by token reads
        the answer out dozens of times; the status right below is the live
        region, and it announces once, when the answer is in.

        Rendered through CoachAnswer rather than as raw text, because the
        model bolds its figures and lists its comparisons — and the raw
        version put the asterisks on screen.
      */}
      {coach.answer && <CoachAnswer text={coach.answer} />}

      {/*
        The token count sits beside the answer's provenance because cost
        visibility is one of the feature's stated guardrails — a number on
        screen, not a line in a log someone would have to know to ask for.
      */}
      <p role="status" className="text-small text-ink-muted mt-2 min-h-[1.125rem]">
        {coach.status === 'answering' && !coach.answer && 'Reading your log…'}
        {coach.status === 'done' &&
          `Answered from your log${coach.usage ? ` — ${coach.usage.inputTokens + coach.usage.outputTokens} tokens` : ''}.`}
      </p>

      {coach.error && (
        <p role="alert" className="text-small text-danger mt-1">
          {coach.error}
        </p>
      )}

      {coach.proposal && (
        <div className="bg-sunken rounded-card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-body text-ink">The coach proposes a brew to try.</p>
          <Button
            variant="quiet"
            onClick={() => {
              const proposal = coach.proposal;
              if (proposal) {
                close();
                onProposal(proposal);
              }
            }}
          >
            Open in Add form
          </Button>
        </div>
      )}
    </Dialog>
  );
}
