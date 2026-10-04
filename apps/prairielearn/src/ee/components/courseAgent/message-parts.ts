import type { UIMessage } from 'ai';

type TranscriptPart =
  { kind: 'part'; part: UIMessage['parts'][number] } | { kind: 'tools'; parts: UIMessage['parts'] };

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

/** Place steering at its accepted stream position instead of repeating it at the end. */
export function buildTranscript(messages: UIMessage[]) {
  const placed = new Set<string>();
  const steering = new Map(
    messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        const value = steeringMarker(part);
        return value ? [[value.id, value] as const] : [];
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
      const correction = steeringMarker(part);
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
      if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
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
  return entries;
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
