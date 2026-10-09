import { TRPCError } from '@trpc/server';

import { ChatError, type ChatSnapshot } from '@prairielearn/course-agent-contract';

import { config } from '../../../lib/config.js';
import type { Course, CourseAgentConversation } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import { isEnterprise } from '../../../lib/license.js';
import {
  type AgentScope,
  selectConversationOperations,
} from '../../../models/course-agent-conversation.js';
import { selectCourseById } from '../../../models/course.js';

import { hasCourseAgentOwnerAccess } from './access.js';
import { workerResponseError } from './errors.js';
import { createCloudflareProvider } from './provider.js';

/** A missing connection token keeps the launcher visible without exposing credentials. */
export function unavailableReason(): string | null {
  return config.courseAgent?.serviceToken
    ? null
    : 'Course agent is unavailable because its connection token is not configured. Contact your administrator.';
}

function integration() {
  if (!config.courseAgent?.serviceToken || !isEnterprise()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Course agent is not configured.',
    });
  }
  return config.courseAgent;
}
export function destination(course: Pick<Course, 'repository' | 'branch'>) {
  const repo = parseGithubRepository(course.repository ?? '');
  if (!repo || !course.branch) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Configure a GitHub repository and branch for this course.',
    });
  }
  return { repository: `${repo.owner}/${repo.repo}`, branch: course.branch };
}
export async function authorize(scope: AgentScope, newWork = false) {
  integration();
  const course = await selectCourseById(scope.course_id);
  if (
    course.deleted_at ||
    course.example_course ||
    (newWork && !(await newWorkEnabled(scope, course)))
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Course agent is unavailable for this course.',
    });
  }
  if (!(await hasCourseAgentOwnerAccess(scope))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Course owner access is required.' });
  }
  return course;
}
export function newWorkEnabled(scope: AgentScope, course: Pick<Course, 'id' | 'institution_id'>) {
  return features.enabled('course-agent', {
    course_id: course.id,
    institution_id: course.institution_id,
    user_id: scope.authn_user_id,
  });
}

async function authorizedDestination(scope: AgentScope, conversation: CourseAgentConversation) {
  const course = await authorize(scope);
  const target = destination(course);
  if (target.repository !== conversation.repository || target.branch !== conversation.branch) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'The course repository or branch changed. Start a new conversation.',
    });
  }
  return course;
}
export async function provider(
  scope: AgentScope,
  conversation: CourseAgentConversation,
  execute = false,
) {
  const settings = integration();
  if (execute) {
    const course = await authorizedDestination(scope, conversation);
    const response = await fetch(
      new URL(`/agents/chat/${conversation.external_id}/configure`, settings.workerUrl),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.serviceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(destination(course)),
        signal: AbortSignal.timeout(10000),
      },
    ).catch(() => {
      throw new ChatError(
        502,
        'Course agent connection failed. Your message was not sent. Check the Worker is running, then retry the send.',
      );
    });
    if (!response.ok) {
      if (response.status === 409) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'This conversation is bound to another repository or branch. Start a new conversation.',
        });
      }
      throw workerResponseError(response.status);
    }
  } else {
    await authorize(scope);
  }
  return createCloudflareProvider(new URL(settings.workerUrl), conversation.external_id);
}

export async function snapshot(conversation: CourseAgentConversation, value: ChatSnapshot) {
  const course = await selectCourseById(conversation.course_id);
  const repository = parseGithubRepository(course.repository ?? '');
  const changed =
    !repository ||
    `${repository.owner}/${repository.repo}` !== conversation.repository ||
    course.branch !== conversation.branch;
  const operations = new Map(
    (await selectConversationOperations(conversation.id)).map((operation) => [
      operation.operation_id,
      operation,
    ]),
  );
  return {
    ...value,
    newWorkUnavailable: changed
      ? 'The course repository or branch changed. Start a new conversation.'
      : undefined,
    messages: value.messages.map((message) => {
      const operation = operations.get(message.id);
      return operation
        ? {
            ...message,
            metadata: {
              ...(typeof message.metadata === 'object' ? message.metadata : {}),
              created_at: operation.created_at.toISOString(),
            },
          }
        : message;
    }),
    operationNumber: conversation.operation_number,
  };
}
