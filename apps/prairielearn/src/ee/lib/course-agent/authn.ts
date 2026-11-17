import { timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { config } from '../../../lib/config.js';
import type { User } from '../../../lib/db-types.js';
import { selectUserById, selectUserIsAdministrator } from '../../../models/user.js';
import { selectOptionalCourseAgentConversationByAgentId } from '../../models/course-agent-conversation.js';

function isServiceToken(authorization: string) {
  const supplied = Buffer.from(authorization);
  return (config.courseAgentServiceToken ?? []).some((token) => {
    const expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

async function selectOptionalConversation(conversationId: string | undefined) {
  const parsedId = z.uuid().safeParse(conversationId);
  return parsedId.success
    ? await selectOptionalCourseAgentConversationByAgentId(parsedId.data)
    : null;
}

async function selectConversationUser(userId: string) {
  const [user, is_administrator] = await Promise.all([
    selectUserById(userId),
    selectUserIsAdministrator(userId),
  ]);
  return { user, is_administrator };
}

/**
 * Authenticates an API request the course agent service makes for a conversation. The service
 * token proves the request comes from the service; the conversation identifies the user, whose
 * normal permissions then apply, including administrator access, so an administrator who can use
 * the agent in a course can also use its tools there. The request may only reach its
 * conversation's course's navigation route, so a model in the sandbox cannot reach other courses
 * or other API routes.
 *
 * Returns null for a request that is not from the service.
 */
export async function authenticateCourseAgentRequest({
  authorization,
  conversationId,
  path,
}: {
  authorization: string | undefined;
  conversationId: string | undefined;
  path: string;
}): Promise<{ user: User; is_administrator: boolean } | { error: string } | null> {
  if (authorization === undefined || conversationId === undefined) return null;
  if (!isServiceToken(authorization)) return null;
  const conversation = await selectOptionalConversation(conversationId);
  if (!conversation) return { error: 'Invalid course agent conversation' };
  // Must match where api/v1/index.ts mounts the router the course agent calls.
  const allowed = `/course/${conversation.course_id}/agent_navigation`;
  if (path !== allowed && !path.startsWith(`${allowed}/`)) {
    return { error: "The course agent may only use its own course's navigation" };
  }
  return await selectConversationUser(conversation.user_id);
}

/**
 * Authenticates a request the course agent service makes to read course data for a conversation,
 * in the same way as its API requests. The conversation must belong to the requested course, so a
 * model in the sandbox cannot reach other courses' data.
 */
export async function authenticateCourseAgentDataRequest({
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
  const conversation = await selectOptionalConversation(conversationId);
  if (!conversation) return { status: 403, error: 'Invalid course agent conversation' };
  if (conversation.course_id !== courseId) {
    return { status: 403, error: 'The course agent may only read its own course data' };
  }
  return await selectConversationUser(conversation.user_id);
}
