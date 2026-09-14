import { expect, it, vi } from 'vitest';

const update = vi.hoisted(() => vi.fn());
vi.mock('../../../models/course-agent.js', () => ({ updateCourseAgentTitle: update }));

import { nameCourseAgentConversation } from './conversation-title.js';

it('names a conversation from its first prompt without a separate model request', async () => {
  await nameCourseAgentConversation({
    conversationId: 'conversation',
    prompt: `  ${'a'.repeat(100)}  `,
  });
  expect(update).toHaveBeenCalledExactlyOnceWith('conversation', 'a'.repeat(80));
});
