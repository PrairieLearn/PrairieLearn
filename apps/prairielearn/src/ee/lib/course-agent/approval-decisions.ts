import { TRPCError } from '@trpc/server';

import { courseAgentSandboxId } from '@prairielearn/course-agent-protocol';

import { type AuthzData, hasRole } from '../../../lib/authz-data-lib.js';
import type { Course, User } from '../../../lib/db-types.js';
import {
  selectOptionalCourseAgentPushApproval,
  updateCourseAgentPushApproval,
} from '../../../models/course-agent.js';

import { respondToCourseAgentPushApproval } from './ephemeral-runtime.js';
import {
  CourseAgentPublicationError,
  courseAgentErrorMessage,
  publishCourseAgentApproval,
} from './publication.js';

export async function resolveCourseAgentApproval({
  course,
  user,
  authzData,
  approvalId,
  decision,
}: {
  course: Course;
  user: User;
  authzData: AuthzData;
  approvalId: string;
  decision: 'approve' | 'deny';
}) {
  if (!hasRole(authzData, ['Owner']) || course.example_course) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Course ownership is required' });
  }
  const approval = await selectOptionalCourseAgentPushApproval({
    approvalId,
    courseId: course.id,
    userId: user.id,
  });
  if (!approval) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Push approval not found' });
  }
  const identity = {
    userId: user.id,
    courseId: course.id,
    conversationId: approval.conversation_id,
    sandboxId: courseAgentSandboxId(approval.conversation_id),
  };
  if (
    approval.status === 'completed' ||
    approval.status === 'denied' ||
    approval.status === 'failed'
  ) {
    await respondToCourseAgentPushApproval({
      ...identity,
      approvalId: approval.id,
      decision: approval.status,
      result: approval.result,
    });
    return {
      status: approval.status,
      message: String(approval.result?.message ?? 'Decision already recorded'),
      published: approval.status === 'completed' || approval.result?.published === true,
    };
  }
  if (decision === 'deny') {
    const denied = await updateCourseAgentPushApproval({
      approvalId: approval.id,
      status: 'denied',
      expectedStatuses: ['pending'],
      decidedBy: user.id,
      result: {
        message:
          'The instructor denied this proposal. Do not publish or resubmit it unchanged. Ask what should change if their reason is unclear.',
      },
    });
    if (!denied) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Approval is no longer pending' });
    }
    await respondToCourseAgentPushApproval({
      ...identity,
      approvalId: approval.id,
      decision: 'denied',
      result: denied.result,
    });
    return { status: 'denied' as const, message: 'Denied request', published: false };
  }

  const publishing = await updateCourseAgentPushApproval({
    approvalId: approval.id,
    status: 'publishing',
    expectedStatuses: ['pending'],
    decidedBy: user.id,
    result: null,
  });
  if (!publishing) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Approval is no longer pending' });
  }
  await respondToCourseAgentPushApproval({
    ...identity,
    approvalId: approval.id,
    decision: 'publishing',
  });
  let publicationResult: Awaited<ReturnType<typeof publishCourseAgentApproval>>;
  try {
    publicationResult = await publishCourseAgentApproval({
      approval: publishing,
      course,
      user,
      authzData,
    });
  } catch (error) {
    const message = courseAgentErrorMessage(error);
    const result = {
      message,
      published: error instanceof CourseAgentPublicationError && error.published,
      ...(error instanceof CourseAgentPublicationError
        ? { jobSequenceId: error.jobSequenceId, commitSha: error.commitSha }
        : {}),
    };
    await updateCourseAgentPushApproval({
      approvalId: approval.id,
      status: 'failed',
      expectedStatuses: ['publishing'],
      decidedBy: user.id,
      result,
    });
    await respondToCourseAgentPushApproval({
      ...identity,
      approvalId: approval.id,
      decision: 'failed',
      result,
    });
    return { status: 'failed' as const, message, published: result.published };
  }
  await updateCourseAgentPushApproval({
    approvalId: approval.id,
    status: 'completed',
    expectedStatuses: ['publishing'],
    decidedBy: user.id,
    result: publicationResult,
  });
  await respondToCourseAgentPushApproval({
    ...identity,
    approvalId: approval.id,
    decision: 'completed',
    result: publicationResult,
  });
  return {
    status: 'completed' as const,
    message: 'Changes published and course sync completed',
    published: true,
  };
}
