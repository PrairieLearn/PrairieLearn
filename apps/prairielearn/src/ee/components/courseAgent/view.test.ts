import { expect, it } from 'vitest';

import { INITIAL_VIEW, conversationView } from './view.js';

const summary = {
  revision: 1,
  status: 'waiting_for_agent' as const,
  activeTurnId: crypto.randomUUID(),
  latestAssistantMessageId: null,
  error: null,
  capabilities: { send: false, stop: true, resume: false },
};
it('replaces replayed state with a fresh snapshot and upserts completion exactly once', () => {
  const message = {
    id: 'reply',
    role: 'assistant' as const,
    parts: [{ type: 'text' as const, text: 'Hel', state: 'streaming' as const }],
  };
  let view = conversationView(INITIAL_VIEW, {
    type: 'event',
    event: 'conversation.snapshot',
    data: { summary, messages: [message], hasMore: false },
  });
  view = conversationView(view, {
    type: 'event',
    event: 'message.delta',
    data: { turnId: summary.activeTurnId, messageId: 'reply', partIndex: 0, text: 'lo' },
  });
  const completed = {
    ...message,
    parts: [{ type: 'text' as const, text: 'Hello', state: 'done' as const }],
  };
  view = conversationView(view, { type: 'event', event: 'message.completed', data: completed });
  view = conversationView(view, { type: 'event', event: 'message.completed', data: completed });
  expect(view.snapshot?.messages).toEqual([completed]);
  view = conversationView(view, { type: 'disconnected' });
  expect(view.connected).toBe(false);
  view = conversationView(view, {
    type: 'event',
    event: 'conversation.snapshot',
    data: { summary, messages: [completed], hasMore: false },
  });
  expect(view.snapshot?.messages).toEqual([completed]);
});
it('ignores stale status revisions', () => {
  const view = conversationView(INITIAL_VIEW, {
    type: 'event',
    event: 'conversation.snapshot',
    data: { summary, messages: [], hasMore: false },
  });
  expect(
    conversationView(view, {
      type: 'event',
      event: 'conversation.status_changed',
      data: { ...summary, revision: 0 },
    }),
  ).toEqual(view);
});
