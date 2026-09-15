import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { claimConversation, createConversation } from './conversations.js';
import { sandboxLifetimeMs } from './sandbox.js';

const owner = { courseId: '1', userId: '2', authnUserId: '3' };
const course = { repository: 'git@github.com:example/course.git', branch: 'main' };
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

test.each(['courseId', 'userId', 'authnUserId'] as const)(
  'rejects a different %s without claiming the conversation',
  (field) => {
    const { conversationId } = createConversation(owner, course);
    expect(() => claimConversation(conversationId, { ...owner, [field]: '99' })).toThrow(
      'Conversation unavailable',
    );
    expect(claimConversation(conversationId, owner).busy).toBe(true);
  },
);

test('allows only one in-flight turn and rejects interrupted conversations', () => {
  const { conversationId } = createConversation(owner, course);
  const conversation = claimConversation(conversationId, owner);
  expect(() => claimConversation(conversationId, owner)).toThrow('already responding');
  conversation.busy = false;
  expect(claimConversation(conversationId, owner)).toBe(conversation);
  conversation.busy = false;
  conversation.failed = true;
  expect(() => claimConversation(conversationId, owner)).toThrow('interrupted');
});

test('forgets expired conversations instead of replaying prompts', () => {
  const { conversationId } = createConversation(owner, course);
  vi.advanceTimersByTime(sandboxLifetimeMs);
  expect(() => claimConversation(conversationId, owner)).toThrow('Start over');
});
