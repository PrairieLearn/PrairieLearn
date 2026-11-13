import { timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { config } from '../../../lib/config.js';
import type { User } from '../../../lib/db-types.js';
import { selectUserById, selectUserIsAdministrator } from '../../../models/user.js';
import { selectOptionalCourseAgentConversationByAgentConversationId } from '../../models/course-agent-conversation.js';

function isServiceToken(authorization: string) {
  const supplied = Buffer.from(authorization);
  return (config.courseAgentServiceToken ?? []).some((token) => {
    const expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

/**
 * Authenticates a request the course agent service makes to read course data for a conversation.
 * The service token proves the request comes from the service; the conversation identifies the
 * user, whose normal permissions then apply, including administrator access, so an administrator
 * who can use the agent in a course can also use its tools there. The conversation must belong to
 * the requested course, so a model in the sandbox cannot reach other courses' data.
 */
export async function authenticateCourseAgentRequest({
  authorization,
  conversationId,
  courseId,
}: {
  authorization: string | undefined;
  conversationId: string | undefined;
  courseId: string;
}): Promise<{ user: User; is_administrator: boolean } | { status: number; error: string }> {
  if (authorization === undefined || !isServiceToken(authorization)) {
    return { status: 401, error: 'A course agent service token must be provided' };
  }
  const parsedId = z.uuid().safeParse(conversationId);
  const conversation = parsedId.success
    ? await selectOptionalCourseAgentConversationByAgentConversationId(parsedId.data)
    : null;
  if (!conversation) return { status: 403, error: 'Invalid course agent conversation' };
  if (conversation.course_id !== courseId) {
    return { status: 403, error: 'The course agent may only read its own course data' };
  }
  const [user, is_administrator] = await Promise.all([
    selectUserById(conversation.user_id),
    selectUserIsAdministrator(conversation.user_id),
  ]);
  return { user, is_administrator };
}
