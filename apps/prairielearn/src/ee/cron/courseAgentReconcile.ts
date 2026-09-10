import { logger } from '@prairielearn/logger';

import { config } from '../../lib/config.js';
import { features } from '../../lib/features/index.js';
import { selectCourseAgentConversationsToReconcile } from '../../models/course-agent.js';
import { reconcileCourseAgentConversation } from '../lib/course-agent/reconcile.js';

export async function run() {
  if (config.courseAgentRuntime === 'disabled') return;
  for (const { conversation, course, run } of await selectCourseAgentConversationsToReconcile()) {
    if (
      !(await features.enabled('course-agent', {
        institution_id: course.institution_id,
        course_id: course.id,
        user_id: conversation.user_id,
      }))
    ) {
      continue;
    }
    try {
      await reconcileCourseAgentConversation({
        conversationId: conversation.id,
        courseId: course.id,
        userId: conversation.user_id,
        sandboxId: conversation.sandbox_id,
        runId: run.id,
      });
    } catch (error) {
      logger.error('Could not reconcile course-agent conversation', {
        conversationId: conversation.id,
        error,
      });
    }
  }
}
