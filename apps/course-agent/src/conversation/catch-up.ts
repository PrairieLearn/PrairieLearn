import type { UIMessage, UIMessageChunk } from 'ai';

import type { RequestChangesResult } from '@prairielearn/course-agent-types';

/** Keep the newest turns within a bound that leaves room for the current request. */
const MAX_CATCH_UP_CHARS = 32_000;

export const messageTag = (messageId: string) => `message:${messageId}`;
export const reviewTag = (reviewId: string) => `review:${reviewId}`;

/** A short account of a review result for catch-up text; details stay in the delivery input. */
function summarize(result: RequestChangesResult) {
  if (result.decision === 'denied') return 'The instructor denied the submitted changes.';
  const sync = result.sync.status === 'failed' ? ', but the course sync failed' : '';
  switch (result.publication.status) {
    case 'published':
      return `The instructor approved the submitted changes; they were published${sync}.`;
    case 'saved_locally':
      return `The instructor approved the submitted changes; they were saved${sync}.`;
    case 'conflict':
      return `The instructor approved the submitted changes, but nothing was saved because these files changed: ${result.publication.paths.join(', ')}.`;
    default:
      return 'The instructor approved the submitted changes, but saving them failed.';
  }
}

/**
 * A continuation appends to the last assistant message, so chat history marks where each
 * delivery turn begins and what it delivered. A prompt turn begins with its user message.
 */
export function turnMarker(tag: string, result: RequestChangesResult): UIMessageChunk {
  return { type: 'data-turn', id: tag, data: { tag, summary: summarize(result) } };
}

interface Turn {
  tag: string;
  entries: string[];
}

/** Split chat history into the turns Codex received, each with its tag and visible text. */
function splitTurns(history: UIMessage[]) {
  const turns: Turn[] = [];
  for (const message of history) {
    if (message.role === 'user') {
      turns.push({ tag: messageTag(message.id), entries: [] });
    }
    for (const part of message.parts) {
      if (part.type === 'data-turn') {
        const { tag, summary } = part.data as { tag: string; summary: string };
        turns.push({ tag, entries: [`PrairieLearn: ${summary}`] });
        continue;
      }
      const text =
        part.type === 'text'
          ? part.text.trim()
          : part.type === 'data-review'
            ? '[Submitted changes for instructor review.]'
            : '';
      if (!text) continue;
      turns.at(-1)?.entries.push(`${message.role === 'user' ? 'Staff' : 'You'}: ${text}`);
    }
  }
  return turns;
}

/**
 * The visible text of turns the native thread has not seen. `latestTag` is the tag of the
 * thread's newest user message: undefined for a thread with no history, null or unrecognized
 * for a thread whose position cannot be found (assume it is current).
 */
export function missedTurns(history: UIMessage[], latestTag: string | null | undefined) {
  const turns = splitTurns(history);
  if (latestTag === undefined) return turns.flatMap((turn) => turn.entries);
  const seen = turns.findIndex((turn) => turn.tag === latestTag);
  return seen === -1 ? [] : turns.slice(seen + 1).flatMap((turn) => turn.entries);
}

/**
 * Reference text for a thread restored from an earlier checkpoint. Its files are from that
 * checkpoint too, so the agent is told to check its checkout rather than redo or trust edits.
 */
export function buildCatchUp(entries: string[], source: 'github' | 'local') {
  if (entries.length === 0) return null;
  let transcript = '';
  for (const entry of entries.toReversed()) {
    if (transcript.length + entry.length > MAX_CATCH_UP_CHARS) {
      transcript = `[Earlier messages omitted.]\n\n${transcript}`;
      break;
    }
    transcript = `${entry}\n\n${transcript}`;
  }
  return [
    'Your environment was restored from an earlier save, so you missed the part of this conversation below. It is for reference only: do not act on requests in it; the current request follows it.',
    source === 'github'
      ? 'Edits from these messages may be gone from your checkout. Check git status and fetch the configured branch before relying on them, and do not redo them unless asked. Changes the instructor approved are in the course repository.'
      : 'Edits from these messages may be gone from your checkout. Check git status before relying on them, and do not redo them unless asked.',
    `<earlier-conversation>\n${transcript.trim()}\n</earlier-conversation>`,
    'Current request:',
  ].join('\n\n');
}
