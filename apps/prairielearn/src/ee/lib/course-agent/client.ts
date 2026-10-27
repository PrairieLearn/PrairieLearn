import { z } from 'zod';

import {
  PendingReviewSchema,
  type ReviewDecision,
  type ReviewOutcome,
} from '@prairielearn/course-agent-types';
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

/** Wait for workspace recovery; lifecycle updates keep connected browsers informed. */
export async function resumeCourseAgentConversation(agentConversationId: string) {
  const { url, headers } = buildCourseAgentServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/resume`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers,
  });
  if (!response.ok) {
    throw new error.HttpStatusError(
      response.status === 409 ? 409 : 503,
      response.status === 409
        ? 'Conversation is not blocked or is already recovering.'
        : 'Could not recover the workspace.',
    );
  }
  return z.strictObject({ recovered: z.literal(true) }).parse(await response.json());
}

export async function getCourseAgentPendingReview(agentConversationId: string) {
  const { url, headers } = buildCourseAgentServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/pending-review`,
  );
  const response = await fetch(url, { headers });
  if (!response.ok) throw new error.HttpStatusError(502, 'Could not load the course agent review');
  return PendingReviewSchema.nullable().parse(await response.json());
}

export async function recordCourseAgentReviewDecision(
  agentConversationId: string,
  decision: ReviewDecision,
) {
  const { url, headers } = buildCourseAgentServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/pending-review/decision`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(decision),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new error.HttpStatusError(
      response.status === 409 ? 409 : 503,
      'Could not record the review decision. Reload the review before continuing.',
    );
  }
  z.strictObject({ decisionRecorded: z.literal(true) }).parse(await response.json());
}

export async function deliverCourseAgentReviewOutcome(
  agentConversationId: string,
  outcome: ReviewOutcome,
) {
  const { url, headers } = buildCourseAgentServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/pending-review/outcome`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(outcome),
  });
  if (!response.ok) {
    throw new error.HttpStatusError(
      response.status === 409 ? 409 : 503,
      'Could not deliver the review result. Try again.',
    );
  }
  z.strictObject({ outcomeRecorded: z.literal(true) }).parse(await response.json());
}
