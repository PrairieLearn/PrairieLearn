import { HttpStatusError } from '@prairielearn/error';

import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import { selectUserById, selectUserIsAdministrator } from '../../../models/user.js';
import { selectOptionalCourseAgentAction } from '../../models/course-agent-action.js';
import { selectOptionalCourseAgentConversationByAgentId } from '../../models/course-agent-conversation.js';

import { courseAgentEnabled } from './access.js';
import { postCourseActionDecision } from './actions/requests.js';
import { postReviewDecision } from './apply-changes.js';

/**
 * Approve a file review or course action the conversation submitted while its owner chose "Always
 * approve". The owner must still be able to use the course agent in the course; the approval is
 * then theirs, with the same checks as when they click "Approve once".
 */
export async function approveReviewAutomatically(agentConversationId: string, reviewId: string) {
  const conversation = await selectOptionalCourseAgentConversationByAgentId(agentConversationId);
  if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
  const user = await selectUserById(conversation.user_id);
  const { authzData, course, institution } = await constructCourseOrInstanceContext({
    user,
    course_id: conversation.course_id,
    course_instance_id: null,
    ip: null,
    req_date: new Date(),
    is_administrator: await selectUserIsAdministrator(user.id),
    // There is no request, so no IP address to derive exam mode from.
    overrides: { mode: 'Public' },
  });
  if (
    !authzData ||
    !(await courseAgentEnabled({
      course,
      institution,
      authn_user: user,
      authz_data: {
        has_course_permission_own: authzData.has_course_permission_own,
        authn_has_course_permission_own: authzData.has_course_permission_own,
      },
    }))
  ) {
    throw new HttpStatusError(403, 'The conversation owner cannot use the course agent here.');
  }
  const action = await selectOptionalCourseAgentAction({
    course_agent_conversation_id: conversation.id,
    agent_action_id: reviewId,
  });
  if (action) {
    return await postCourseActionDecision({
      ctx: { course, user, authz_data: authzData },
      conversation,
      action,
      decision: 'approved',
    });
  }
  return await postReviewDecision({
    course,
    conversation,
    user,
    authzData: {
      has_course_permission_edit: authzData.has_course_permission_edit,
      authn_user: user,
    },
    reviewId,
    decision: 'approved',
  });
}
