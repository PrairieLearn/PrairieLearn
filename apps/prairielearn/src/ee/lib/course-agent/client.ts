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
export async function createCourseAgentConversation(binding: {
  repository: string;
  branch: string;
}): Promise<string> {
  const { url, headers } = buildCourseAgentServiceRequest('conversations');
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(binding),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new error.HttpStatusError(502, 'Could not create the course agent conversation');
  }
  return CreatedConversationSchema.parse(await response.json()).id;
}

/** Durably admits recovery; lifecycle updates report its eventual outcome. */
export async function resumeCourseAgentConversation(agentConversationId: string) {
  const { url, headers } = buildCourseAgentServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/resume`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new error.HttpStatusError(
      response.status === 409 ? 409 : 503,
      response.status === 409
        ? 'Conversation is not blocked or is already recovering.'
        : 'Could not start workspace recovery.',
    );
  }
  return z.strictObject({ accepted: z.literal(true) }).parse(await response.json());
}
