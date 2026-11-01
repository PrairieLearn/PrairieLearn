/**
 * Local editing writes the approved files and syncs from disk. Git editing writes,
 * commits, and pushes the approved files, then syncs from disk. Both use the editor's job.
 */
import { stripVTControlCharacters } from 'node:util';

import {
  type PendingReview,
  type RequestChangesResult,
  type ReviewSnapshot,
  SavedJobOutcomeSchema,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { checkSignedToken, generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import type { Course, CourseAgentConversation, User } from '../../../lib/db-types.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import { type ServerJobExecutor, getJobSequence } from '../../../lib/server-jobs.js';
import type { JobSequenceWithTokens } from '../../../lib/server-jobs.types.js';
import { selectCourseById } from '../../../models/course.js';

import {
  deliverCourseAgentReviewOutcome,
  getCourseAgentPendingReview,
  recordCourseAgentReviewDecision,
} from './client.js';
import { createReviewDiff } from './review-diff.js';
import { REVIEWED_CHANGES_DESCRIPTION, ReviewedChangesEditor } from './reviewed-changes-editor.js';

function verifyReviewBinding(
  course: Pick<Course, 'repository' | 'branch'>,
  snapshot: ReviewSnapshot,
) {
  if (snapshot.type === 'local') {
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
    `${repository.owner}/${repository.repo}` !== snapshot.repository ||
    course.branch !== snapshot.branch
  ) {
    throw new HttpStatusError(409, 'The course repository or branch changed. Start a new review.');
  }
}

function claims(conversation: CourseAgentConversation, review: PendingReview, reviewerId: string) {
  return {
    purpose: 'course_agent_review',
    conversationId: conversation.id,
    courseId: conversation.course_id,
    reviewerId,
    callId: review.callId,
  };
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
  verifyReviewBinding(course, review.snapshot);
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
  verifyReviewBinding(course, review.snapshot);
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
  const editor = new ReviewedChangesEditor({ course, user, authzData, snapshot: review.snapshot });
  const serverJob = await editor.prepareServerJob();
  try {
    await recordCourseAgentReviewDecision(conversation.agent_conversation_id, {
      callId: review.callId,
      decision,
      jobSequenceId: serverJob.jobSequenceId,
    });
  } catch (error) {
    await serverJob.executeUnsafe(async (job) => {
      job.stop('Saving was not started. Inspect the review before continuing.');
    });
    throw error;
  }
  void applyChanges(editor, serverJob, conversation, review);
  return { decision, jobSequenceId: serverJob.jobSequenceId };
}

async function applyChanges(
  editor: ReviewedChangesEditor,
  serverJob: ServerJobExecutor,
  conversation: CourseAgentConversation,
  review: PendingReview,
) {
  try {
    try {
      await editor.executeWithServerJob(
        serverJob,
        review.snapshot.type === 'github' ? { expectedBaseCommit: review.snapshot.baseCommit } : {},
      );
    } catch {
      // The editor has already persisted the failure and save/sync flags in its job.
    }
    const sequence = await getReviewJob(conversation, serverJob.jobSequenceId);
    const outcome = getReviewJobOutcome(sequence);
    if (outcome.result) {
      await deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
        callId: review.callId,
        result: outcome.result,
      });
    }
  } catch (error) {
    logger.error(
      'Course agent outcome delivery failed; Resume can retrieve the saved job outcome.',
      error,
    );
  }
}

export async function getReviewJob(conversation: CourseAgentConversation, jobSequenceId: string) {
  const sequence = await getJobSequence(jobSequenceId, conversation.course_id);
  if (
    sequence.type !== 'sync' ||
    sequence.description !== REVIEWED_CHANGES_DESCRIPTION ||
    sequence.authn_user_id !== conversation.user_id
  ) {
    throw new HttpStatusError(404, 'Job not found.');
  }
  return sequence;
}

/** Reconstruct the same outcome for callback delivery and Resume from the finished editor job. */
export function getReviewJobOutcome(sequence: JobSequenceWithTokens) {
  const job = sequence.jobs[0];
  const data: Record<string, unknown> = job.data;
  const running = job.status === 'Running';
  const diagnostics = stripVTControlCharacters(job.output ?? '');
  const result: RequestChangesResult | null =
    !data.publicationUncertain && (job.status === 'Success' || job.status === 'Error')
      ? {
          decision: 'approved',
          publication: data.saveSucceeded
            ? typeof data.commitHash === 'string'
              ? { status: 'published', commitSha: data.commitHash }
              : { status: 'saved_locally' }
            : { status: 'failed', error: diagnostics },
          sync: !data.saveSucceeded
            ? { status: 'not_attempted' }
            : data.syncSucceeded
              ? { status: 'succeeded' }
              : { status: 'failed', error: diagnostics },
        }
      : null;
  return SavedJobOutcomeSchema.parse({
    callId: null,
    jobSequenceId: sequence.id,
    status: running ? 'running' : result ? 'completed' : 'blocked',
    result,
    error:
      running || result
        ? null
        : diagnostics || 'Saving was interrupted. Inspect the job before retrying.',
  });
}
