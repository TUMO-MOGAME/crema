import type { CoachEvent } from '@crema/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import { streamCoachAnswer } from './coach-stream';

/**
 * The stream parser at its edges. The happy path — our own backend's LF-framed
 * events — is covered end to end in coach.test.tsx; these cases are about the
 * framings the SSE format permits and the payloads it does not.
 */

function respondWithStream(body: string) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      ),
  );
}

async function collect(question: string): Promise<CoachEvent[]> {
  const events: CoachEvent[] = [];
  for await (const event of streamCoachAnswer(question, new AbortController().signal)) {
    events.push(event);
  }
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamCoachAnswer', () => {
  it('reads CRLF-framed events, which the SSE format permits and proxies produce', async () => {
    // The same two events the backend would send, joined the other dialect's
    // way. A parser that only split on \n\n would buffer forever.
    respondWithStream(
      'event: text\r\ndata: {"type":"text","delta":"Hello"}\r\n\r\n' +
        'event: done\r\ndata: {"type":"done","usage":{"inputTokens":1,"outputTokens":2},"toolCalls":0}\r\n\r\n',
    );

    const events = await collect('what did I brew?');

    expect(events).toEqual([
      { type: 'text', delta: 'Hello' },
      { type: 'done', usage: { inputTokens: 1, outputTokens: 2 }, toolCalls: 0 },
    ]);
  });

  it('reports unparseable JSON with the contract error, not a raw SyntaxError', async () => {
    respondWithStream('event: text\ndata: {not json at all\n\n');

    const failure = await collect('hello').catch((error: unknown) => error);

    // The same failure as a schema mismatch — the stream said something this
    // app cannot read — so the reader sees one message, not two dialects of it.
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toContain('does not understand');
  });
});
