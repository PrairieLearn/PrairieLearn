import { timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { config } from '../../../lib/config.js';
import type { User } from '../../../lib/db-types.js';
import { selectUserById } from '../../../models/user.js';
import { selectOptionalCourseAgentConversationByAgentConversationId } from '../../models/course-agent-conversation.js';

function isServiceToken(authorization: string) {
  const supplied = Buffer.from(authorization);
  return (config.courseAgentServiceToken ?? []).some((token) => {
    const expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

/**
 * Authenticates an API request the course agent service makes for a conversation. The service
 * token proves the request comes from the service; the conversation identifies the user, whose
 * normal permissions then apply. The request may only reach its conversation's course data and
 * navigation routes, so a
 * model in the sandbox cannot reach other courses or other API routes.
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
}): Promise<{ user: User } | { error: string } | null> {
  if (authorization === undefined || conversationId === undefined) return null;
  if (!isServiceToken(authorization)) return null;
  const parsedId = z.uuid().safeParse(conversationId);
  const conversation = parsedId.success
    ? await selectOptionalCourseAgentConversationByAgentConversationId(parsedId.data)
    : null;
  if (!conversation) return { error: 'Invalid course agent conversation' };
  // Must match where api/v1/index.ts mounts the routers the course agent calls.
  const allowed = ['data', 'agent_navigation'].map(
    (route) => `/course/${conversation.course_id}/${route}`,
  );
  if (!allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return { error: "The course agent may only use its own course's data and navigation" };
  }
  return { user: await selectUserById(conversation.user_id) };
}
