import { logger } from '@prairielearn/logger';

import { constructCourseOrInstanceContext } from '../../lib/authz-data.js';
import { config } from '../../lib/config.js';
import { features } from '../../lib/features/index.js';
import { selectCourseAgentConversationsToReconcile } from '../../models/course-agent.js';
import { selectUserSettings } from '../../models/user-settings.js';
import { selectOptionalUserById } from '../../models/user.js';
import { resolveCourseAgentApproval } from '../lib/course-agent/approval-decisions.js';
import { reconcileCourseAgentPushApproval } from '../lib/course-agent/publication.js';
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
      const snapshot = await reconcileCourseAgentConversation({
        conversationId: conversation.id,
        courseId: course.id,
        userId: conversation.user_id,
        sandboxId: conversation.sandbox_id,
        runId: run.id,
      });
      if (snapshot.pendingApproval) {
        const approval = await reconcileCourseAgentPushApproval({
          proposal: snapshot.pendingApproval,
          course,
          conversationId: conversation.id,
          sandboxId: conversation.sandbox_id,
          runId: snapshot.activeRunId ?? run.id,
          userId: conversation.user_id,
        });
        const settings = await selectUserSettings({ user_id: conversation.user_id });
        if (approval.status === 'pending' && settings.course_agent_approval_mode === 'always') {
          const user = await selectOptionalUserById(conversation.user_id);
          if (!user) continue;
          const context = await constructCourseOrInstanceContext({
            user,
            course_id: course.id,
            course_instance_id: null,
            ip: null,
            req_date: new Date(),
            is_administrator: false,
          });
          // Background approval requires current course ownership, not a cached session privilege.
          if (context.authzData?.has_course_permission_own && !course.example_course) {
            await resolveCourseAgentApproval({
              course,
              user,
              authzData: context.authzData,
              approvalId: approval.id,
              decision: 'approve',
            });
          }
        }
      }
    } catch (error) {
      logger.error('Could not reconcile course-agent conversation', {
        conversationId: conversation.id,
        error,
      });
    }
  }
}
