import { CourseAgentTitleResponseSchema } from '@prairielearn/course-agent-protocol';
import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import {
  claimCourseAgentTitle,
  selectCourseAgentHistory,
  updateCourseAgentTitle,
} from '../../../models/course-agent.js';

export function isGreeting(prompt: string) {
  return /^(hi|hello|hey|hey there|hi there|hello there|yo|yo wassup|sup|howdy|good morning|good afternoon|good evening|thanks|thank you|ok|okay|test|testing)[\s!.?]*$/i.test(
    prompt.trim(),
  );
}

export function fallbackConversationTitle(prompt: string) {
  const title = prompt.replaceAll(/\s+/g, ' ').trim().slice(0, 80);
  return title === 'New conversation' ? 'Course authoring conversation' : title;
}

export async function nameCourseAgentConversation(conversationId: string) {
  const history = await selectCourseAgentHistory(conversationId);
  const prompt = history.messages.find(
    (message) =>
      message.role === 'user' &&
      !isGreeting(message.content) &&
      history.messages.some(
        (reply) => reply.run_id === message.run_id && reply.role === 'assistant',
      ),
  );
  if (!prompt) return;
  const reply = history.messages.find(
    (message) => message.run_id === prompt.run_id && message.role === 'assistant',
  )!;
  const fallback = fallbackConversationTitle(prompt.content);
  // Claim once across relay completion, reloads, and multiple PL processes. If naming fails,
  // the persisted fallback remains useful and we do not repeatedly charge for retries.
  const conversation = await claimCourseAgentTitle(conversationId, fallback);
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
      response: reply.content.slice(0, 4000),
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
  await updateCourseAgentTitle(conversationId, fallback, title);
}
