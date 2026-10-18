import type { UIMessageChunk } from 'ai';

import type { ConversationEvent, Message } from '@prairielearn/course-agent-protocol';

/** Only the public parts implemented by the minimal runtime cross the service boundary. */
export function publicMessage(message: {
  id: string;
  role: string;
  parts: { type: string; text?: string; state?: string }[];
}): Message {
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    parts: message.parts.flatMap((part) => {
      if ((part.type !== 'text' && part.type !== 'reasoning') || typeof part.text !== 'string') {
        return [];
      }
      return [
        {
          type: part.type,
          text: part.text,
          state: part.state === 'streaming' ? 'streaming' : 'done',
        },
      ];
    }),
  };
}

/** A connection-independent view of the SDK's live output; never a second persisted transcript. */
export class Output {
  readonly message: Message;
  private readonly partIndexes = new Map<string, number>();

  constructor(
    private readonly turnId: string,
    messageId: string,
  ) {
    this.message = { id: messageId, role: 'assistant', parts: [] };
  }

  accept(chunk: UIMessageChunk): ConversationEvent | null {
    switch (chunk.type) {
      case 'text-start':
      case 'reasoning-start': {
        const index = this.message.parts.length;
        this.partIndexes.set(chunk.id, index);
        const part = {
          type: chunk.type === 'text-start' ? ('text' as const) : ('reasoning' as const),
          text: '',
          state: 'streaming' as const,
        };
        this.message.parts.push(part);
        return {
          type: 'event',
          event: 'message.part_updated',
          data: {
            turnId: this.turnId,
            messageId: this.message.id,
            partIndex: index,
            part: { ...part },
          },
        };
      }
      case 'text-delta':
      case 'reasoning-delta': {
        const index = this.partIndexes.get(chunk.id);
        if (index === undefined) throw new Error('Delta without a part');
        this.message.parts[index].text += chunk.delta;
        return {
          type: 'event',
          event: 'message.delta',
          data: {
            turnId: this.turnId,
            messageId: this.message.id,
            partIndex: index,
            text: chunk.delta,
          },
        };
      }
      case 'text-end':
      case 'reasoning-end': {
        const index = this.partIndexes.get(chunk.id);
        if (index === undefined) throw new Error('Completion without a part');
        const part = this.message.parts[index];
        part.state = 'done';
        return {
          type: 'event',
          event: 'message.part_updated',
          data: {
            turnId: this.turnId,
            messageId: this.message.id,
            partIndex: index,
            part: { ...part },
          },
        };
      }
      default:
        return null;
    }
  }
}
