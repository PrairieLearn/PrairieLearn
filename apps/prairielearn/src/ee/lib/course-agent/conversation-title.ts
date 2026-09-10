import { CourseAgentTitleResponseSchema } from '@prairielearn/course-agent-protocol';
import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import {
  claimCourseAgentTitle,
  selectCourseAgentHistory,
  updateCourseAgentTitle,
} from '../../../models/course-agent.js';

const defaultDependencies = {
  claimCourseAgentTitle,
  selectCourseAgentHistory,
  updateCourseAgentTitle,
};

export function fallbackConversationTitle(prompt: string) {
  const title = prompt.replaceAll(/\s+/g, ' ').trim().slice(0, 80);
  return title === 'New conversation' ? 'Course authoring conversation' : title;
}

export async function nameCourseAgentConversation(
  conversationId: string,
  dependencies: typeof defaultDependencies = defaultDependencies,
) {
  const history = await dependencies.selectCourseAgentHistory(conversationId);
  const prompt = history.messages.find((message) => message.role === 'user');
  if (!prompt) return;
  const fallback = fallbackConversationTitle(prompt.content);
  // Claim once across message submissions and multiple PL processes. If naming fails,
  // the persisted fallback remains useful and we do not repeatedly charge for retries.
  const conversation = await dependencies.claimCourseAgentTitle(conversationId, fallback);
  if (!conversation || config.courseAgentRuntime !== 'cloudflare') return;
  if (!config.courseAgentCapabilitySecret) {
    throw new Error('Course-agent capability secret is not configured');
  }
  const capability = generateSignedToken(
    {
      type: 'course-agent-title',
      conversationId,
      userId: conversation.user_id,
      courseId: conversation.course_id,
      prompt: prompt.content.slice(0, 4000),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
    config.courseAgentCapabilitySecret,
  );
  const response = await fetch(new URL('/v1/title', config.courseAgentWorkerOrigin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Conversation title request failed (${response.status})`);
  const { title } = CourseAgentTitleResponseSchema.parse(await response.json());
  await dependencies.updateCourseAgentTitle(conversationId, fallback, title);
}
