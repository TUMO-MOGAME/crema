import type { BrewProposal, CoachEvent, CoachToolName } from '@crema/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api-client';
import { streamCoachAnswer } from './coach-stream';

/**
 * One coach conversation turn, as state a component can render.
 *
 * Not React Query, deliberately. A streamed answer is not a value that a cache
 * can hold or refetch — it is a growing string, a trace that lengthens, and a
 * status that moves — so the machinery for caching values would all be worked
 * around. What matters is kept instead: one request in flight at a time, abort
 * on the way out, and errors owned by the attempt.
 */

export interface CoachTraceLine {
  tool: CoachToolName;
  summary: string;
}

interface CoachState {
  status: 'idle' | 'answering' | 'done' | 'failed';
  answer: string;
  trace: CoachTraceLine[];
  proposal: BrewProposal | null;
  error: string | null;
  /** From the `done` event — cost visibility is a guardrail, not a debug detail. */
  usage: { inputTokens: number; outputTokens: number } | null;
}

const IDLE: CoachState = {
  status: 'idle',
  answer: '',
  trace: [],
  proposal: null,
  error: null,
  usage: null,
};

export function useCoach() {
  const [state, setState] = useState<CoachState>(IDLE);
  const controller = useRef<AbortController | null>(null);

  // Unmounting mid-answer must stop the meter: the signal reaches the fetch,
  // the fetch's disconnect reaches the API, and the API hands it to the model.
  useEffect(() => () => controller.current?.abort(), []);

  const ask = async (question: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    setState({ ...IDLE, status: 'answering' });

    try {
      for await (const event of streamCoachAnswer(question, current.signal)) {
        if (current.signal.aborted) return;
        setState((previous) => apply(previous, event));
      }

      // A stream that ended without its `done` still ended; leaving the status
      // on "answering" would leave a spinner over a finished answer.
      setState((previous) =>
        previous.status === 'answering' ? { ...previous, status: 'done' } : previous,
      );
    } catch (error) {
      if (current.signal.aborted) return;

      setState((previous) => ({
        ...previous,
        status: 'failed',
        error: error instanceof ApiError ? error.message : 'Something went wrong. Ask again.',
      }));
    }
  };

  const reset = () => {
    controller.current?.abort();
    setState(IDLE);
  };

  return { ...state, ask, reset };
}

function apply(previous: CoachState, event: CoachEvent): CoachState {
  switch (event.type) {
    case 'text':
      return { ...previous, answer: previous.answer + event.delta };

    case 'tool-call':
      return {
        ...previous,
        trace: [...previous.trace, { tool: event.tool, summary: event.summary }],
      };

    case 'proposal':
      return { ...previous, proposal: event.proposal };

    case 'done':
      return { ...previous, status: 'done', usage: event.usage };

    case 'error':
      // Partial answer text stays on screen — the reader saw it arrive, and
      // making it vanish under the error would read as the app losing it.
      return { ...previous, status: 'failed', error: event.message };
  }
}
