import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { ChatSnapshot } from '@prairielearn/course-agent-contract';

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
import { modelPricing } from './usage.js';

function integration() {
  if (!config.courseAgent || !isEnterprise()) {
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
      message:
        'Course repository changed. Start a new conversation; existing cleanup remains available.',
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
    );
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
    const model = z.object({ model: z.string().min(1) }).parse(await response.json());
    if (!modelPricing(model.model)) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Configure course agent pricing for ${model.model} before starting work.`,
      });
    }
  } else {
    await authorize(scope);
  }
  return createCloudflareProvider(new URL(settings.workerUrl), conversation.external_id);
}

export async function snapshot(conversation: CourseAgentConversation, value: ChatSnapshot) {
  const operations = await selectConversationOperations(conversation.id);
  return {
    ...value,
    messages: value.messages.map((message) => {
      const operation = operations.find((operation) => operation.operation_id === message.id);
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
    revision: conversation.revision,
  };
}
