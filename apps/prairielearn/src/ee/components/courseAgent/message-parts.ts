import type { UIMessage } from 'ai';

import type { ApprovalDisplay } from '@prairielearn/course-agent-contract';

export function isVisibleMessage(message: UIMessage) {
  const metadata = message.metadata;
  return (
    !(
      metadata &&
      typeof metadata === 'object' &&
      'source' in metadata &&
      metadata.source === 'tool-result'
    ) && !message.parts.some((p) => p.type === 'data-tool-display')
  );
}

type TranscriptPart =
  | { kind: 'part'; part: UIMessage['parts'][number] }
  | { kind: 'tools'; parts: UIMessage['parts'] }
  | { kind: 'code-change'; approval: ApprovalDisplay };

/** Keep durable code changes at their request marker as their decision changes. */
export function buildTranscript(messages: UIMessage[], approvals: ApprovalDisplay[]) {
  const placed = new Set<string>();
  const requested = new Set(
    messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        const id = toolMarkerId(part, 'data-tool');
        return id ? [id] : [];
      }),
    ),
  );
  const entries: { id: string; role: UIMessage['role']; parts: TranscriptPart[] }[] = [];
  for (const message of messages) {
    const parts: TranscriptPart[] = [];
    for (const part of message.parts) {
      const marker = toolMarkerId(part, 'data-tool') ?? toolMarkerId(part, 'data-tool-display');
      if (marker) {
        if (part.type === 'data-tool-display' && requested.has(marker)) continue;
        const approval = approvals.find((approval) => approval.id === marker);
        if (approval && !placed.has(marker)) {
          parts.push({ kind: 'code-change', approval });
          placed.add(marker);
        }
        continue;
      }
      if (!isVisibleMessage(message)) continue;
      if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
        // The durable marker renders the full code-change card for this call.
        if (
          'toolName' in part &&
          part.toolName === 'push_sync' &&
          message.parts.some((p) => toolMarkerId(p, 'data-tool'))
        ) {
          continue;
        }
        const previous = parts.at(-1);
        if (previous?.kind === 'tools') previous.parts.push(part);
        else parts.push({ kind: 'tools', parts: [part] });
      } else if (
        part.type === 'text' ||
        part.type === 'reasoning' ||
        part.type === 'data-steering'
      ) {
        parts.push({ kind: 'part', part });
      }
    }
    if (parts.length > 0) entries.push({ id: message.id, role: message.role, parts });
  }
  // Snapshot updates can arrive before the stream's marker. Never hide an actionable request.
  for (const approval of approvals) {
    if (!placed.has(approval.id)) {
      entries.push({
        id: `code-change-${approval.id}`,
        role: 'assistant',
        parts: [{ kind: 'code-change', approval }],
      });
    }
  }
  return entries;
}

function toolMarkerId(part: UIMessage['parts'][number], type: string) {
  return part.type === type &&
    'data' in part &&
    part.data &&
    typeof part.data === 'object' &&
    'id' in part.data &&
    typeof part.data.id === 'string'
    ? part.data.id
    : undefined;
}
