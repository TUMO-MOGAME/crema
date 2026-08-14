import type { ReactNode } from 'react';

/**
 * The coach's answer, rendered rather than dumped.
 *
 * The model writes the light markdown every chat-tuned model writes — bold
 * around the figures, a dash list when comparing — and showing that raw put
 * literal asterisks in the middle of a sentence about coffee. A markdown
 * pipeline would be a dependency plus a sanitiser for a surface that needs
 * neither, so this renders exactly the subset the coach is prompted to use
 * and nothing more: paragraphs, dash and numbered lists, bold, italic and
 * code. Everything lands as React text nodes — there is no HTML anywhere in
 * the path, so a model that emits `<script>` gets its eight characters shown,
 * not run.
 *
 * Streaming is the one wrinkle. The answer re-renders as it grows and a bold
 * figure arrives marker-first — `**1:1` — so closed pairs render bold and an
 * unclosed opener at the tail renders as bold-in-progress, rather than as two
 * asterisks that flash and vanish when the closer lands a token later.
 */

interface CoachAnswerProps {
  text: string;
}

export function CoachAnswer({ text }: CoachAnswerProps) {
  return (
    <div className="text-body text-ink mt-4 flex flex-col gap-2">
      {toBlocks(text).map((block, at) => {
        if (block.kind === 'list') {
          const items = block.items.map((item, index) => <li key={index}>{inline(item)}</li>);

          return block.ordered ? (
            <ol key={at} className="flex list-decimal flex-col gap-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={at} className="flex list-disc flex-col gap-1 pl-5">
              {items}
            </ul>
          );
        }

        return (
          <p
            key={at}
            className={block.emphasis ? 'text-ink-strong font-semibold' : 'whitespace-pre-wrap'}
          >
            {inline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type Block =
  | { kind: 'paragraph'; text: string; emphasis?: boolean }
  | { kind: 'list'; ordered: boolean; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Headings are a fallback, not a feature: the prompt says no headings, and a
 * model that writes one anyway should read as a short bold line, not as a row
 * of hash marks.
 */
const HEADING = /^#{1,6}\s+(.*)$/;

/**
 * Lines into blocks. Consecutive markers of one kind pool into one list;
 * consecutive prose lines pool into one paragraph; a blank line ends whatever
 * is open. Line-based rather than split-on-blank-lines because models attach
 * lists directly beneath their lead-in sentence with no blank line between.
 */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
      paragraph = [];
    }
  };

  for (const line of text.split('\n')) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);

    if (bullet || numbered) {
      flush();
      const ordered = numbered !== null;
      const item = (bullet ?? numbered)?.[1] ?? '';
      const open = blocks[blocks.length - 1];

      if (open?.kind === 'list' && open.ordered === ordered) open.items.push(item);
      else blocks.push({ kind: 'list', ordered, items: [item] });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'paragraph', text: heading[1] ?? '', emphasis: true });
      continue;
    }

    if (line.trim() === '') flush();
    else paragraph.push(line);
  }

  flush();
  return blocks;
}

/** Code binds tightest, then bold, then italic. No nesting — the coach has no use for it. */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)/g;

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE)) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));

    const [token] = match;
    if (match[1] !== undefined) {
      nodes.push(
        <code key={key} className="bg-sunken rounded px-1">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <strong key={key} className="text-ink-strong font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    key += 1;
    cursor = match.index + token.length;
  }

  const rest = text.slice(cursor);

  // The stream's edge: an opener whose closer has not arrived yet renders as
  // bold-in-progress. A completed answer never legitimately holds a lone
  // `**`, so treating one as "bold from here" costs nothing real and saves
  // the flash.
  const pending = rest.indexOf('**');
  if (pending === -1) {
    if (rest) nodes.push(rest);
    return nodes;
  }

  if (pending > 0) nodes.push(rest.slice(0, pending));

  const opened = rest.slice(pending + 2);
  if (opened) {
    nodes.push(
      <strong key={key} className="text-ink-strong font-semibold">
        {opened}
      </strong>,
    );
  }

  return nodes;
}
