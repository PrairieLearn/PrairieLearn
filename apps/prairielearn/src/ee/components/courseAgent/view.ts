import type { ConversationEvent, Message, Snapshot } from '@prairielearn/course-agent-protocol';

export interface ConversationView {
  connected: boolean;
  snapshot: Snapshot | null;
}
export type ViewAction =
  | ConversationEvent
  | { type: 'disconnected' }
  | { type: 'reset' }
  | { type: 'older'; data: Snapshot };
export const INITIAL_VIEW: ConversationView = { connected: false, snapshot: null };

function upsert(messages: Message[], message: Message) {
  if (!messages.some((existing) => existing.id === message.id)) return [...messages, message];
  return messages.map((existing) => (existing.id === message.id ? message : existing));
}

export function conversationView(state: ConversationView, action: ViewAction): ConversationView {
  if (action.type === 'reset') return INITIAL_VIEW;
  if (action.type === 'disconnected') return { ...state, connected: false };
  if (action.type === 'event' && action.event === 'conversation.snapshot') {
    return { connected: true, snapshot: action.data };
  }
  const snapshot = state.snapshot;
  if (!snapshot) return state;
  if (action.type === 'older') {
    const ids = new Set(snapshot.messages.map((message) => message.id));
    return {
      ...state,
      snapshot: {
        ...snapshot,
        hasMore: action.data.hasMore,
        messages: [
          ...action.data.messages.filter((message) => !ids.has(message.id)),
          ...snapshot.messages,
        ],
      },
    };
  }
  switch (action.event) {
    case 'conversation.status_changed':
      if (action.data.revision < snapshot.summary.revision) return state;
      return { ...state, snapshot: { ...snapshot, summary: action.data } };
    case 'message.completed':
      return {
        ...state,
        snapshot: { ...snapshot, messages: upsert(snapshot.messages, action.data) },
      };
    case 'message.part_updated':
    case 'message.delta': {
      const data = action.data;
      const existing = snapshot.messages.find((message) => message.id === data.messageId);
      const message: Message = existing
        ? { ...existing, parts: [...existing.parts] }
        : { id: data.messageId, role: 'assistant', parts: [] };
      if (action.event === 'message.part_updated') {
        message.parts[data.partIndex] = action.data.part;
      } else {
        const part = message.parts.at(data.partIndex);
        if (!part) return state;
        message.parts[data.partIndex] = { ...part, text: part.text + action.data.text };
      }
      return { ...state, snapshot: { ...snapshot, messages: upsert(snapshot.messages, message) } };
    }
    default:
      return state;
  }
}
