import { coachEventSchema, type CoachEvent, type CoachRequest } from '@crema/shared';
import { isApiErrorBody } from '@crema/shared';
import { ApiError, API_BASE_URL } from '../../lib/api-client';

/**
 * The coach's answer, event by event.
 *
 * `EventSource` cannot POST, so the stream is read by hand: fetch, then the
 * body decoded incrementally and split on the blank line the SSE format ends
 * every event with. Each `data:` payload is parsed against `coachEventSchema` —
 * the same schema the backend's own tests hold the stream to — so an event the
 * contract does not know is an error here, at the seam, rather than an
 * `undefined` three components later.
 *
 * Failures before the stream opens (503 without a key, 429 over budget, 400 on
 * the question) arrive as ordinary error responses and are thrown as the same
 * `ApiError` every other call produces. Failures mid-stream arrive as the
 * stream's final `error` event, which is yielded like any other — rendering it
 * is the caller's decision, because by then there is partial answer text on
 * screen and only the caller knows what to do with it.
 */
export async function* streamCoachAnswer(
  question: string,
  signal: AbortSignal,
): AsyncGenerator<CoachEvent> {
  const response = await fetch(`${API_BASE_URL}/api/ai/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question } satisfies CoachRequest),
    signal,
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);

    if (isApiErrorBody(payload)) {
      throw new ApiError(
        payload.error.code,
        payload.error.message,
        response.status,
        payload.error.details ?? [],
        payload.error.requestId,
      );
    }

    throw new ApiError(
      'INTERNAL_ERROR',
      `The server responded with status ${response.status}.`,
      response.status,
    );
  }

  if (!response.body) {
    throw new ApiError('INTERNAL_ERROR', 'The server sent no answer stream.', response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffered += decoder.decode(value, { stream: true });

      // Everything before the last blank line is complete events; whatever
      // follows it is an event still arriving and stays buffered. The SSE
      // format allows CRLF line endings as well as LF — our backend writes
      // LF, but a proxy that re-frames the stream is allowed to disagree,
      // and a parser that only knew one dialect would silently buffer the
      // whole answer waiting for a delimiter that never comes.
      const blocks = buffered.split(/\r?\n\r?\n/);
      buffered = blocks.pop() ?? '';

      for (const block of blocks) {
        const event = parseEvent(block);
        if (event) yield event;
      }
    }

    const last = parseEvent(buffered);
    if (last) yield last;
  } finally {
    // Covers every way out — completion, a thrown parse failure, the caller
    // abandoning the loop. A reader left unreleased holds the connection, and
    // the whole point of handing the signal down is that navigating away
    // stops the meter.
    await reader.cancel().catch(() => undefined);
  }
}

/** One SSE block to one validated event; blocks without data are keep-alives. */
function parseEvent(block: string): CoachEvent | null {
  // The lazy match plus optional `\r` keeps a CRLF-framed line from smuggling
  // its carriage return into the JSON payload.
  const data = /^data: (.+?)\r?$/m.exec(block)?.[1];
  if (!data) return null;

  // Unparseable JSON and a shape the schema refuses are the same failure —
  // the stream said something this app cannot read — so they throw the same
  // error, rather than one wearing the contract's message and the other
  // escaping as a raw SyntaxError.
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new ApiError('INTERNAL_ERROR', 'The coach sent an event this app does not understand.', 200); // prettier-ignore
  }

  const parsed = coachEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiError('INTERNAL_ERROR', 'The coach sent an event this app does not understand.', 200); // prettier-ignore
  }

  return parsed.data;
}
