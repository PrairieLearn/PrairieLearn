import type { UIMessage } from 'ai';
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

/** Creates a conversation in Cloudflare and returns its service-generated ID; no agent turn runs yet. */
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

/** Reads saved history and follows the current reply through one HTTP response. */
export async function getCourseAgentChat(
  agentConversationId: string,
  signal: AbortSignal,
): Promise<Response> {
  const { url, headers } = buildServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/chat`,
  );
  return await fetch(url, { headers, signal });
}

/** Cancellation is an execution command, independent of any output reader. */
export async function stopCourseAgentChat(
  agentConversationId: string,
  assistantMessageId: string,
  signal: AbortSignal,
): Promise<Response> {
  const { url, headers } = buildServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/stop`,
  );
  return await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assistantMessageId }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
}

/**
 * Sends the newest user message to the course agent service. The response body
 * is the reply as an AI SDK UI message stream. Aborting `signal` only detaches
 * this reader; use the explicit Stop command to cancel execution.
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
