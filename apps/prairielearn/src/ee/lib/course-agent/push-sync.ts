import { stripVTControlCharacters } from 'node:util';

import {
  type PendingReview,
  type RequestChangesResult,
  RequestChangesResultSchema,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { checkSignedToken, generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import type { Course, CourseAgentConversation, User } from '../../../lib/db-types.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import {
  type ServerJob,
  type ServerJobLogger,
  createServerJob,
  selectJobsByJobSequenceId,
} from '../../../lib/server-jobs.js';
import { insertAuditEvent } from '../../../models/audit-event.js';
import { selectCourseById } from '../../../models/course.js';

import {
  deliverCourseAgentReviewOutcome,
  getCourseAgentPendingReview,
  recordCourseAgentReviewDecision,
} from './client.js';
import { createReviewDiff } from './review-diff.js';
import { ReviewedChangesEditor } from './reviewed-changes-editor.js';

function claims(conversation: CourseAgentConversation, review: PendingReview, reviewerId: string) {
  return {
    purpose: 'course_agent_review',
    conversationId: conversation.id,
    courseId: conversation.course_id,
    reviewerId,
    callId: review.callId,
  };
}

function verifyBinding(course: Pick<Course, 'repository' | 'branch'>, review: PendingReview) {
  if (review.snapshot.type === 'local') {
    if (!config.devMode || config.fileEditorUseGit) {
      throw new HttpStatusError(
        409,
        'Local course requests require local file editing. Start a new conversation.',
      );
    }
    return;
  }
  if (!config.fileEditorUseGit) {
    throw new HttpStatusError(409, 'Git editing was disabled. Start a new conversation.');
  }
  const repository = parseGithubRepository(course.repository ?? '');
  if (
    !repository ||
    `${repository.owner}/${repository.repo}` !== review.snapshot.repository ||
    course.branch !== review.snapshot.branch
  ) {
    throw new HttpStatusError(409, 'The course repository or branch changed. Start a new review.');
  }
}

/** Generate the review from immutable local Git objects and saved bytes. */
export async function getPendingReview(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  conversation: CourseAgentConversation,
  reviewerId: string,
  callId: string,
) {
  const review = await getCourseAgentPendingReview(conversation.agent_conversation_id);
  if (review?.callId !== callId) return null;
  verifyBinding(course, review);
  const patch = await createReviewDiff(course, review.snapshot);
  return {
    callId: review.callId,
    card: review.card,
    status: review.status,
    jobSequenceId: review.jobSequenceId,
    error: review.error,
    reviewToken: generateSignedToken(claims(conversation, review, reviewerId), config.secretKey),
    diff: { patch },
  };
}

export async function postReviewDecision({
  course: courseContext,
  conversation,
  user,
  authnUserId,
  authzData,
  reviewToken,
  decision,
}: {
  course: Pick<Course, 'id'>;
  conversation: CourseAgentConversation;
  user: Pick<User, 'id' | 'name' | 'email' | 'uid'>;
  authzData: { has_course_permission_edit: boolean; authn_user: Pick<User, 'id'> };
  authnUserId: string;
  reviewToken: string;
  decision: 'approved' | 'denied';
}) {
  const course = await selectCourseById(courseContext.id);
  const review = await getCourseAgentPendingReview(conversation.agent_conversation_id);
  if (
    !review ||
    !checkSignedToken(reviewToken, claims(conversation, review, authnUserId), config.secretKey)
  ) {
    throw new HttpStatusError(409, 'This review has changed. Reload it before deciding.');
  }
  verifyBinding(course, review);
  if (review.status !== 'pending') {
    // Approval starts a job; denial has no job. Repeated decisions must agree.
    const previousDecision = review.jobSequenceId === null ? 'denied' : 'approved';
    if (decision !== previousDecision) {
      throw new HttpStatusError(409, 'This review already has a different decision.');
    }
    return { decision, jobSequenceId: review.jobSequenceId };
  }
  // Claim the decision before doing external work. This binds approval to one job
  // (or records denial) while the separate outcome reports what actually happened.
  if (decision === 'denied') {
    await recordCourseAgentReviewDecision(conversation.agent_conversation_id, {
      callId: review.callId,
      decision,
    });
    await insertAuditEvent({
      tableName: 'course_agent_conversations',
      rowId: conversation.id,
      courseId: course.id,
      action: 'update',
      actionDetail: 'push_sync_review',
      oldRow: conversation,
      newRow: conversation,
      agentAuthnUserId: authnUserId,
      agentUserId: user.id,
      context: { decision, callId: review.callId },
    });
    await deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
      callId: review.callId,
      result: {
        decision,
        publication: { status: 'not_attempted' },
        sync: { status: 'not_attempted' },
      },
    });
    return { decision, jobSequenceId: null };
  }
  const executor = await runInTransactionAsync(async () => {
    const executor = await createServerJob({
      courseId: course.id,
      userId: user.id,
      authnUserId,
      type: 'course_agent_push_sync',
      description: 'Save and sync reviewed course edits',
    });
    const [job] = await selectJobsByJobSequenceId(executor.jobSequenceId);
    await insertAuditEvent({
      tableName: 'jobs',
      rowId: job.id,
      courseId: course.id,
      action: 'insert',
      newRow: job,
      agentAuthnUserId: authnUserId,
      agentUserId: user.id,
      context: { decision, conversationId: conversation.id, callId: review.callId },
    });
    return executor;
  });
  try {
    await recordCourseAgentReviewDecision(conversation.agent_conversation_id, {
      callId: review.callId,
      decision,
      jobSequenceId: executor.jobSequenceId,
    });
  } catch (error) {
    await executor.execute(async (job) => {
      job.data.agentConversationId = conversation.agent_conversation_id;
      job.data.callId = review.callId;
      job.data.error = 'Saving was not started. Inspect the review before continuing.';
      job.stop(String(job.data.error));
    });
    throw error;
  }
  // This is the editor's only job: executeWithJob() reuses it rather than creating
  // another sync job. Persist its outcome before attempting the callback.
  void executor
    .execute(async (job) => {
      job.data.agentConversationId = conversation.agent_conversation_id;
      job.data.callId = review.callId;
      const lines: string[] = [];
      const log = (method: keyof ServerJobLogger, line: string) => {
        lines.push(line);
        job[method](line);
      };
      const editorJob: ServerJob = {
        data: job.data,
        exec: job.exec.bind(job),
        fail: job.fail.bind(job),
        stop: job.stop.bind(job),
        info: (line) => log('info', line),
        error: (line) => log('error', line),
        warn: (line) => log('warn', line),
        verbose: (line) => log('verbose', line),
      };
      let failure: string | null = null;
      try {
        const current = await selectCourseById(course.id);
        verifyBinding(current, review);
        const editor = new ReviewedChangesEditor({
          course: current,
          user,
          authzData,
          snapshot: review.snapshot,
        });
        await editor.executeWithJob(
          editorJob,
          review.snapshot.type === 'github'
            ? { expectedBaseCommit: review.snapshot.baseCommit }
            : {},
        );
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        editorJob.error(failure);
      }
      if (job.data.publicationUncertain) {
        job.data.error = failure;
        job.fail(failure!);
      }
      const diagnostics = stripVTControlCharacters(lines.join('\n'));
      const result: RequestChangesResult = job.data.saveSucceeded
        ? {
            decision: 'approved',
            publication:
              review.snapshot.type === 'local'
                ? { status: 'saved_locally' }
                : { status: 'published', commitSha: String(job.data.commitHash) },
            sync: job.data.syncSucceeded
              ? { status: 'succeeded' }
              : { status: 'failed', error: diagnostics },
          }
        : {
            decision: 'approved',
            publication: { status: 'failed', error: diagnostics },
            sync: { status: 'not_attempted' },
          };
      job.data.result = result;
      if (!job.data.saveSucceeded || result.sync.status !== 'succeeded') {
        job.fail('Reviewed changes were not saved and synced successfully.');
      }
    })
    .then(async ({ data }) => {
      const result = RequestChangesResultSchema.safeParse(data.result);
      if (result.success) {
        await deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
          callId: review.callId,
          result: result.data,
        });
      }
    })
    .catch((error: unknown) =>
      logger.error(
        'Course agent outcome delivery failed; Resume can retrieve the saved job result.',
        error,
      ),
    );
  return { decision, jobSequenceId: executor.jobSequenceId };
}
