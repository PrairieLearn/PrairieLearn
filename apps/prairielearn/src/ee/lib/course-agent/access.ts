import { type AgentScope } from '../../../models/course-agent-conversation.js';
import { selectCoursePermissionForUser } from '../../../models/course-permissions.js';

/** Administrative access alone does not grant permission to run the course agent. */
export async function hasCourseAgentOwnerAccess(scope: AgentScope) {
  const roles = await Promise.all(
    [...new Set([scope.user_id, scope.authn_user_id])].map((user_id) =>
      selectCoursePermissionForUser({ course_id: scope.course_id, user_id }),
    ),
  );
  return roles.every((role) => role === 'Owner');
}
