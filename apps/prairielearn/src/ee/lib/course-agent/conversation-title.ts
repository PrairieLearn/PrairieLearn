import { CourseAgentTitleResponseSchema } from '@prairielearn/course-agent-protocol';
import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import { updateCourseAgentTitle } from '../../../models/course-agent.js';

const defaultDependencies = {
  updateCourseAgentTitle,
};

export async function nameCourseAgentConversation(
  {
    conversationId,
    runId,
    userId,
    courseId,
    prompt,
  }: {
    conversationId: string;
    runId: string;
    userId: string;
    courseId: string;
    prompt: string;
  },
  dependencies: typeof defaultDependencies = defaultDependencies,
) {
  if (config.courseAgentRuntime === 'fake') {
    await dependencies.updateCourseAgentTitle(conversationId, prompt.trim().slice(0, 80));
    return;
  }
  if (config.courseAgentRuntime !== 'cloudflare') return;
  if (!config.courseAgentCapabilitySecret) {
    throw new Error('Course-agent capability secret is not configured');
  }
  const capability = generateSignedToken(
    {
      type: 'course-agent-title',
      runId,
      conversationId,
      userId,
      courseId,
      prompt: prompt.slice(0, 4000),
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
  await dependencies.updateCourseAgentTitle(conversationId, title);
}
