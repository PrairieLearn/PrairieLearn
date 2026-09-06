import { logger } from '@prairielearn/logger';

import { persistCourseAgentSnapshot as saveSnapshot } from '../../../models/course-agent.js';

import { nameCourseAgentConversation } from './conversation-title.js';

export async function persistCourseAgentSnapshot(input: Parameters<typeof saveSnapshot>[0]) {
  await saveSnapshot(input);
  if (!input.snapshot.activeRunId && input.snapshot.response && !input.snapshot.error) {
    // Naming does not hold up the completed chat stream or require a connected browser.
    void nameCourseAgentConversation(input.snapshot.conversationId).catch(() => {
      logger.warn('Course-agent title generation failed; keeping the fallback title', {
        conversationId: input.snapshot.conversationId,
      });
    });
  }
}
