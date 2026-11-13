import type { UIMessage, UIMessageChunk } from 'ai';

import {
  InputRequestPartSchema,
  type RequestChangesResult,
  ToolCallSchema,
  UserMessageMetadataSchema,
} from '@prairielearn/course-agent-types';

import { attachmentOf, attachmentPath } from './attachments.js';

/** Keep the newest turns within a bound that leaves room for the current request. */
const MAX_CATCH_UP_CHARS = 32_000;
const OMITTED_MARKER = '[Earlier messages omitted.]\n\n';

export const messageTag = (messageId: string) => `message:${messageId}`;

/**
 * The user message a new turn submits. The SDK persists a submit that overlaps a running turn
 * and runs its turn afterwards, so the newest history entry may be another turn's reply. Take
 * the first user message after the last one submitted; without one, the newest user message.
 */
export function nextUserMessage(history: UIMessage[], submittedId: string | null) {
  const submitted = submittedId === null ? -1 : history.findIndex(({ id }) => id === submittedId);
  if (submitted === -1) return history.findLast(({ role }) => role === 'user') ?? null;
  return history.slice(submitted + 1).find(({ role }) => role === 'user') ?? null;
}

/**
 * The history a turn may catch up on: everything except its own message and user messages
 * queued after it, which later turns submit. Replies recorded after its message are kept.
 */
export function historyBefore(history: UIMessage[], message: UIMessage | null) {
  const index = message ? history.indexOf(message) : -1;
  if (index === -1) return history;
  return history.filter((entry, i) => i < index || (i > index && entry.role !== 'user'));
}

/** An account of a review result, used in chat history markers and catch-up text. */
export function summarizeReview(result: RequestChangesResult) {
  if (result.decision === 'denied') return 'The instructor denied the submitted changes.';
  const approved = 'The instructor approved the submitted changes';
  const sync = result.sync.status === 'failed' ? ', but the course sync failed' : '';
  switch (result.publication.status) {
    case 'published':
      return `${approved}; they were published${sync}.`;
    case 'saved_locally':
      return `${approved}; they were saved${sync}.`;
    case 'conflict':
      return `${approved}, but nothing was saved because these files changed: ${result.publication.paths.join(', ')}.`;
    case 'failed':
      return `${approved}, but saving them failed.`;
    case 'unknown':
      return `${approved}, but PrairieLearn could not confirm whether they were saved.`;
    case 'not_attempted':
      return `${approved}.`;
  }
}

const DENIAL_NOT_SAVED = 'Nothing was saved; your edits remain private to this conversation.';
const DENIED_BY_MESSAGE = 'The instructor denied the submitted changes by sending this message.';

/**
 * The input of a turn whose message denied a pending review: the denial and what the agent
 * should do next, then the message as written.
 */
export function describeDenialMessage(text: string) {
  return [
    DENIED_BY_MESSAGE,
    DENIAL_NOT_SAVED,
    'Respond to their message. If it asks for changes, make them and submit the revised changes for review. If it only asks a question, answer it, then submit the same changes for review again. If it says to drop the changes, do not resubmit.',
    `Their message:\n\n${text}`,
  ].join('\n\n');
}

/**
 * The delivery turn's input: the summary, what the agent should do next, and any save or sync
 * output. The agent never sees the result's structure, only this text.
 */
export function describeReviewResult(result: RequestChangesResult, source: 'github' | 'local') {
  const output = (title: string, text: string) => `${title}:\n${text.trim() || '(no output)'}`;
  const parts = [summarizeReview(result)];
  if (result.decision === 'denied') {
    parts.push(
      DENIAL_NOT_SAVED,
      'Do not revise or resubmit on your own. Ask the instructor what they would like changed, then end your turn.',
    );
  } else if (result.publication.status === 'published') {
    parts.push(
      'Fetch the configured origin branch and reconcile your checkout before editing again.',
    );
  } else if (result.publication.status === 'conflict') {
    parts.push(
      'Fetch the configured origin branch, reconcile its updates with your edits while preserving both, and request a new review.',
    );
  } else if (result.publication.status === 'failed') {
    parts.push(
      'Your edits remain private to this conversation.',
      output('Save output', result.publication.error),
    );
  } else if (result.publication.status === 'unknown') {
    parts.push(
      source === 'github'
        ? 'PrairieLearn lost track of the save before it finished, so the changes may or may not be in the course repository. Fetch the configured origin branch and check whether it contains them before continuing; if not, request a new review.'
        : 'PrairieLearn lost track of the save before it finished, so the changes may or may not have been saved. Ask the instructor to check whether the course files contain them; if not, request a new review.',
    );
  }
  if (result.sync.status === 'failed') {
    parts.push(
      result.publication.status === 'published'
        ? 'The pushed changes stay in the repository even though the course sync failed.'
        : 'The saved changes stay in the course even though the course sync failed.',
      output('Course sync output', result.sync.error),
    );
  }
  return parts.join('\n\n');
}

/**
 * A continuation appends to the last assistant message, so chat history marks where each
 * delivery turn begins and what it delivered. A prompt turn begins with its user message.
 */
export function turnMarker(tag: string, summary: string): UIMessageChunk {
  return { type: 'data-turn', id: tag, data: { tag, summary } };
}

/** Marks, in chat history, that the turn's user message denied a pending review. */
export function denialMarker(reviewId: string): UIMessageChunk {
  return { type: 'data-denial', id: `denial:${reviewId}`, data: { reviewId } };
}

interface Turn {
  tag: string;
  entries: string[];
}

/**
 * Tool calls stay out of catch-up, since their output would crowd out the conversation, except
 * for a one-line record of changed files: a restored checkout may have lost those edits.
 */
function describeFileChange(data: unknown) {
  const call = ToolCallSchema.safeParse(data);
  if (!call.success || call.data.kind !== 'fileChange' || call.data.status !== 'completed') {
    return '';
  }
  const { changes, omittedChanges } = call.data;
  const paths = changes.map((change) => change.movePath ?? change.path);
  if (omittedChanges > 0) paths.push(`${omittedChanges} more`);
  return `[Changed files: ${paths.join(', ')}.]`;
}

/**
 * A replayed staff line names the page it was sent from and the most specific item on it, so
 * "this question" or "here" in an earlier message keeps its referent.
 */
function staffSpeaker(metadata: unknown) {
  const location = UserMessageMetadataSchema.safeParse(metadata ?? {}).data?.location;
  if (!location) return 'Staff';
  const item = location.question
    ? `question ${JSON.stringify(location.question)}${location.questionFromAnotherCourse ? ' shared from another course' : ''}`
    : location.assessment
      ? `assessment ${JSON.stringify(location.assessment)}`
      : location.courseInstance
        ? `course instance ${JSON.stringify(location.courseInstance)}`
        : null;
  const hint = [location.page && `page ${JSON.stringify(location.page)}`, item].filter(Boolean);
  return hint.length > 0 ? `Staff (on ${hint.join(', ')})` : 'Staff';
}

/** A restored thread may have lost the prompts that staff's next message answers. */
function describeInputRequest(data: unknown) {
  const part = InputRequestPartSchema.safeParse(data);
  if (!part.success) return '';
  return part.data.prompts
    .map(({ title, options }) =>
      options?.length ? `[Asked: ${title} (options: ${options.join('; ')})]` : `[Asked: ${title}]`,
    )
    .join('\n');
}

/** The text a part contributes to catch-up, or an empty string if it contributes none. */
function describePart(part: UIMessage['parts'][number]) {
  switch (part.type) {
    case 'text':
      return part.text.trim();
    case 'data-review':
      return '[Submitted changes for instructor review.]';
    case 'data-input-request':
      return describeInputRequest(part.data);
    case 'data-tool':
      return describeFileChange(part.data);
    case 'file': {
      const attachment = attachmentOf(part);
      return attachment ? `[Attached ${attachmentPath(attachment)}]` : '';
    }
    default:
      return '';
  }
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
      if (part.type === 'data-denial') {
        // The marker follows the user message it describes, so it precedes it in catch-up.
        turns.at(-1)?.entries.unshift(`PrairieLearn: ${DENIED_BY_MESSAGE}`);
        continue;
      }
      const text = describePart(part);
      if (!text) continue;
      const speaker = message.role === 'user' ? staffSpeaker(message.metadata) : 'You';
      turns.at(-1)?.entries.push(`${speaker}: ${text}`);
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
  let transcript = entries.map((entry) => `${entry}\n\n`).join('');
  if (transcript.length > MAX_CATCH_UP_CHARS) {
    // The marker counts toward the limit, so the kept turns get the remaining room.
    const room = MAX_CATCH_UP_CHARS - OMITTED_MARKER.length;
    let kept = '';
    for (const entry of entries.toReversed()) {
      const next = `${entry}\n\n${kept}`;
      if (next.length > room) break;
      kept = next;
    }
    // The newest entry carries the most context, so keep its end even when it alone is too long.
    transcript = OMITTED_MARKER + (kept || `${entries.at(-1)!.slice(-(room - 2))}\n\n`);
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
