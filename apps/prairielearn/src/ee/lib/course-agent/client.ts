import { type UIMessage, validateUIMessages } from 'ai';
import { z } from 'zod';

import * as error from '@prairielearn/error';

import { config } from '../../../lib/config.js';

function buildServiceRequest(path: string) {
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

/** Starts the conversation in Cloudflare and returns its service-generated ID. */
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

/** Loads a conversation's history from the course agent service. */
export async function fetchCourseAgentMessages(agentConversationId: string): Promise<UIMessage[]> {
  const { url, headers } = buildServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/messages`,
  );
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new error.HttpStatusError(502, 'Could not load the course agent conversation');
  }
  const messages: unknown = await response.json();
  // `validateUIMessages` rejects an empty array, which is a valid history.
  if (Array.isArray(messages) && messages.length === 0) return [];
  return await validateUIMessages({ messages });
}

/**
 * Sends the newest user message to the course agent service. The response body
 * is the reply as an AI SDK UI message stream. Aborting `signal` closes the request;
 * stopping generation in the Durable Object is not yet reliable.
 */
export async function postCourseAgentChat({
  agentConversationId,
  message,
  context,
  signal,
}: {
  agentConversationId: string;
  message: Omit<UIMessage, 'id'>;
  context: { courseTitle: string; courseShortName: string };
  signal: AbortSignal;
}): Promise<Response> {
  const { url, headers } = buildServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/chat`,
  );
  return await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
    signal,
  });
}
