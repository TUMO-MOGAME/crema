import { AI_LIMITS, type BrewProposal } from '@crema/shared';
import { useId, useState } from 'react';
import { Button } from '../../components/button';
import { CONTROL_CLASS } from '../../components/field';
import { ApiError } from '../../lib/api-client';
import { useQuickLog } from './use-ai';

/**
 * Quick Log — the sentence box at the top of the Add form.
 *
 * The model proposes and the human commits: whatever comes back lands in the
 * form below as values to check, never in the database. This component owns the
 * sentence and the request; what to do with a proposal is the form's decision,
 * which is why the only thing handed out is `onProposal`.
 *
 * It sits outside the `<form>` element on purpose. Inside it, Enter in the
 * sentence box would submit the brew — the one thing this feature must never do
 * on its own.
 */

interface QuickLogPanelProps {
  onProposal: (proposal: BrewProposal) => void;
}

export function QuickLogPanel({ onProposal }: QuickLogPanelProps) {
  const id = useId();
  const statusId = `${id}-status`;
  const [text, setText] = useState('');
  const quickLog = useQuickLog();

  const propose = () => {
    const sentence = text.trim();
    if (!sentence || quickLog.isPending) return;

    quickLog.mutate(sentence, { onSuccess: onProposal });
  };

  const message = statusMessage(quickLog);

  return (
    <section
      aria-label="Quick log"
      className="bg-sunken rounded-card mb-4 flex flex-col gap-1.5 p-4"
    >
      <label htmlFor={id} className="text-small text-ink-muted font-medium">
        Say it in a sentence
      </label>

      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              propose();
            }
          }}
          maxLength={AI_LIMITS.quickLogMaxLength}
          placeholder="18g of the Ethiopian through the V60, 300 water, solid 4"
          autoComplete="off"
          aria-describedby={statusId}
          className={CONTROL_CLASS}
        />

        <Button
          onClick={propose}
          disabled={quickLog.isPending || text.trim() === ''}
          className="shrink-0"
        >
          {quickLog.isPending ? 'Reading…' : 'Pre-fill'}
        </Button>
      </div>

      {/*
        One live region for every outcome — reading, filled, refused — so what
        happened is announced without moving focus away from the sentence. The
        fixed height keeps the panel from jumping as messages come and go.
      */}
      <p
        id={statusId}
        role="status"
        className={`text-small min-h-[1.125rem] ${quickLog.isError ? 'text-danger' : 'text-ink-muted'}`}
      >
        {message}
      </p>
    </section>
  );
}

/**
 * What the panel says about the last attempt.
 *
 * An empty proposal is a valid answer and is worded as one: the model read the
 * sentence and found no brew in it, which is not a failure to retry but a form
 * to fill in by hand.
 */
function statusMessage(quickLog: ReturnType<typeof useQuickLog>): string | null {
  if (quickLog.isPending) return 'Reading your sentence…';

  if (quickLog.isError) {
    return quickLog.error instanceof ApiError
      ? quickLog.error.message
      : 'Something went wrong. Try again.';
  }

  if (quickLog.isSuccess) {
    const proposal = quickLog.data;

    if (Object.keys(proposal.brew).length === 0) {
      return 'Nothing in that read as a brew — fill the form in below.';
    }

    return proposal.inferred.length > 0
      ? 'Filled from your sentence. Check the fields marked inferred.'
      : 'Filled from your sentence.';
  }

  return null;
}
