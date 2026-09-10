import type { CourseAgentMessage } from '../../lib/course-agent/ui-stream.js';

export function courseRefreshMessageId({
  messages,
  busy,
  pageRenderedAt,
  courseCommitSha,
}: {
  messages: CourseAgentMessage[];
  busy: boolean;
  pageRenderedAt: string;
  courseCommitSha: string | null;
}): string | undefined {
  if (busy) return;
  const message = messages.at(-1);
  if (message?.role !== 'assistant') return;
  const sync = message.parts.filter((part) => part.type === 'data-courseSynced').at(-1);
  if (
    sync?.type === 'data-courseSynced' &&
    Date.parse(sync.data.syncedAt) > Date.parse(pageRenderedAt) &&
    (!sync.data.commitSha || sync.data.commitSha !== courseCommitSha) &&
    !message.metadata?.failure &&
    message.parts.some((part) => part.type === 'text' && part.text.trim())
  ) {
    return message.id;
  }
}
