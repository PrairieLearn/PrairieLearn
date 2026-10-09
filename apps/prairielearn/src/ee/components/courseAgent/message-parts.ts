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

/** Keep the complete snapshot visible until the resumed stream catches up to it. */
export function mergeSnapshotMessages(snapshot: UIMessage[], streamed: UIMessage[]) {
  return [
    ...snapshot.map((saved) => {
      const incoming = streamed.find((message) => message.id === saved.id);
      if (!incoming || incoming.parts.length < saved.parts.length) return saved;
      const caughtUp = saved.parts.every((part, index) => {
        const next = incoming.parts[index];
        if (part.type !== next.type) return false;
        if (part.type === 'text' || part.type === 'reasoning') {
          return (
            'text' in next && typeof next.text === 'string' && next.text.length >= part.text.length
          );
        }
        if ('state' in part && typeof part.state === 'string' && part.state.startsWith('output-')) {
          return (
            'state' in next && typeof next.state === 'string' && next.state.startsWith('output-')
          );
        }
        return true;
      });
      return caughtUp ? { ...incoming, metadata: saved.metadata ?? incoming.metadata } : saved;
    }),
    ...streamed.filter((message) => !snapshot.some((saved) => saved.id === message.id)),
  ];
}

/** Keep durable code changes at their request marker as their decision changes. */
export function buildTranscript(messages: UIMessage[], approvals: ApprovalDisplay[]) {
  const placed = new Set<string>();
  const steering = new Map(
    messages.filter(isVisibleMessage).flatMap((message) =>
      message.parts.flatMap((part) => {
        const value = steeringMarker(part);
        return value ? [[value.id, value] as const] : [];
      }),
    ),
  );
  const failures = new Map(
    messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        const id = toolMarkerId(part, 'data-tool-display');
        if (
          !id ||
          !('data' in part) ||
          !part.data ||
          typeof part.data !== 'object' ||
          !('value' in part.data)
        ) {
          return [];
        }
        const value = part.data.value;
        return value &&
          typeof value === 'object' &&
          'error' in value &&
          typeof value.error === 'string'
          ? [[id, value.error] as const]
          : [];
      }),
    ),
  );
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
    if (message.role === 'user' && steering.has(message.id)) continue;
    let parts: TranscriptPart[] = [];
    let entryId = message.id;

    function flush() {
      if (parts.length > 0) entries.push({ id: entryId, role: message.role, parts });
      parts = [];
    }
    for (const part of message.parts) {
      const correction = isVisibleMessage(message) ? steeringMarker(part) : undefined;
      if (correction) {
        flush();
        if (!placed.has(correction.id)) {
          const user = messages.find(
            (candidate) => candidate.id === correction.id && candidate.role === 'user',
          );
          entries.push({
            id: correction.id,
            role: 'user',
            parts: [
              {
                kind: 'part',
                part: {
                  type: 'text',
                  text:
                    user?.parts
                      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                      .join('\n') || correction.text,
                },
              },
            ],
          });
          placed.add(correction.id);
        }
        entryId = `${message.id}:after:${correction.id}`;
        continue;
      }
      const marker = toolMarkerId(part, 'data-tool') ?? toolMarkerId(part, 'data-tool-display');
      if (marker) {
        if (part.type === 'data-tool-display' && requested.has(marker)) continue;
        const approval = approvals.find((approval) => approval.id === marker);
        if (approval && !placed.has(marker)) {
          parts.push({ kind: 'code-change', approval });
          placed.add(marker);
        } else if (failures.has(marker) && !placed.has(marker)) {
          parts.push({
            kind: 'tools',
            parts: [
              {
                type: 'dynamic-tool',
                toolName: 'push_sync',
                toolCallId: marker,
                state: 'output-error',
                input: {},
                errorText: failures.get(marker)!,
              },
            ],
          });
          placed.add(marker);
        }
        continue;
      }
      if (!isVisibleMessage(message)) continue;
      if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
        // The durable marker renders the full code-change card for this call.
        if (
          (part.type === 'tool-push_sync' ||
            ('toolName' in part && part.toolName === 'push_sync')) &&
          message.parts.some((p) => {
            const id = toolMarkerId(p, 'data-tool');
            return id && (approvals.some((approval) => approval.id === id) || failures.has(id));
          })
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
    flush();
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

function steeringMarker(part: UIMessage['parts'][number]) {
  if (
    part.type !== 'data-steering' ||
    !('data' in part) ||
    !part.data ||
    typeof part.data !== 'object'
  ) {
    return undefined;
  }
  const data = part.data;
  return 'id' in data &&
    typeof data.id === 'string' &&
    'text' in data &&
    typeof data.text === 'string' &&
    data.text.trim()
    ? { id: data.id, text: data.text }
    : undefined;
}
