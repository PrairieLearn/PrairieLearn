import { z } from 'zod';

import { type Snapshot, SnapshotSchema } from '@prairielearn/course-agent-protocol';
import * as error from '@prairielearn/error';

import { config } from '../../../lib/config.js';

export function buildServiceRequest(path: string) {
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

/** Creates a conversation without starting inference. */
export async function createCourseAgentConversation(): Promise<string> {
  const { url, headers } = buildServiceRequest('conversations');
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

export async function fetchCourseAgentSnapshot(
  conversationId: string,
  before?: string,
): Promise<Snapshot> {
  const { url, headers } = buildServiceRequest(
    `conversations/${encodeURIComponent(conversationId)}/snapshot`,
  );
  if (before) url.searchParams.set('before', before);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new error.HttpStatusError(502, 'Could not load the course agent conversation');
  }
  return SnapshotSchema.parse(await response.json());
}
