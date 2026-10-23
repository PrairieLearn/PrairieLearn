import { z } from 'zod';

import * as error from '@prairielearn/error';

import { config } from '../../../lib/config.js';

export function buildCourseAgentServiceRequest(path: string) {
  const { courseAgentServiceUrl, courseAgentServiceToken } = config;
  if (!courseAgentServiceUrl || !courseAgentServiceToken) {
    throw new error.HttpStatusError(503, 'The course agent service is not configured');
  }
  return {
    url: new URL(
      path,
      courseAgentServiceUrl.endsWith('/') ? courseAgentServiceUrl : `${courseAgentServiceUrl}/`,
    ),
    headers: { Authorization: `Bearer ${courseAgentServiceToken}` },
  };
}

const CreatedConversationSchema = z.object({ id: z.uuid() });

/** Creates a conversation in Cloudflare and returns its service-generated ID; no agent turn runs yet. */
export async function createCourseAgentConversation(): Promise<string> {
  const { url, headers } = buildCourseAgentServiceRequest('conversations');
  const response = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new error.HttpStatusError(502, 'Could not create the course agent conversation');
  }
  return CreatedConversationSchema.parse(await response.json()).id;
}
