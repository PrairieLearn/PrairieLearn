/**
 * PrairieLearn owns each review's decision, editor job, and result in `course_agent_reviews`; the
 * agent service owns the snapshot and delivering the result to the agent. A result is recorded
 * before it is sent, so a failed send is retried by the sweeper or by Resume, never lost.
 *
 * Local editing writes the approved files and syncs from disk. Git editing writes,
 * commits, and pushes the approved files, then syncs from disk. Both use the editor's job.
 */
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import {
  type RequestChangesResult,
  RequestChangesResultSchema,
  type Review,
  type ReviewSnapshot,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../../lib/config.js';
import type {
  Course,
  CourseAgentConversation,
  CourseAgentReview,
  User,
} from '../../../lib/db-types.js';
import { FileDeleteEditor, FileUploadEditor, MultiEditor } from '../../../lib/editors.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import { type ServerJobExecutor, getJobSequence } from '../../../lib/server-jobs.js';
import type { JobSequenceWithTokens } from '../../../lib/server-jobs.types.js';
import { selectCourseById } from '../../../models/course.js';
import {
  insertCourseAgentReview,
  selectOptionalCourseAgentReview,
  selectUndeliveredCourseAgentReviews,
  updateCourseAgentReviewDelivered,
  updateCourseAgentReviewResult,
} from '../../models/course-agent-review.js';

import {
  deliverCourseAgentReviewResult,
  getCourseAgentReview,
  resumeCourseAgentConversation,
} from './client.js';
import { ReviewConflictSchema, checkReviewConflicts } from './review-conflicts.js';
import { createReviewDiff } from './review-diff.js';

const jobDescriptions = {
  local: 'Save and sync reviewed local course edits',
  github: 'Publish and sync reviewed course edits',
};

const MAX_DIAGNOSTICS_LENGTH = 16_000;

const DENIED: RequestChangesResult = {
  decision: 'denied',
  publication: { status: 'not_attempted' },
  sync: { status: 'not_attempted' },
};

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

/**
 * A pending review shows its diff, generated from immutable local Git objects and saved bytes.
 * A decided review shows its job and, once finished, its result.
 */
export async function getReview(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  conversation: CourseAgentConversation,
  reviewId: string,
) {
  const decided = await selectOptionalCourseAgentReview({
    course_agent_conversation_id: conversation.id,
    agent_review_id: reviewId,
  });
  if (decided) {
    return {
      status: 'decided' as const,
      result: decided.result === null ? null : RequestChangesResultSchema.parse(decided.result),
    };
  }
  const review = await getCourseAgentReview(conversation.agent_conversation_id, reviewId);
  if (!review) return { status: 'unavailable' as const };
  let diff: { patch: string | null; error: string | null };
  try {
    verifyReviewBinding(course, review.snapshot);
    diff = { patch: await createReviewDiff(course, review.snapshot), error: null };
  } catch (error) {
    // A broken diff must not hide the pending review or prevent its owner from denying it.
    if (!(error instanceof HttpStatusError)) {
      logger.error('Course agent review diff failed', error);
      Sentry.captureException(error);
    }
    diff = {
      patch: null,
      error: error instanceof Error ? error.message : 'Could not load the reviewed changes.',
    };
  }
  return { status: 'pending' as const, diff };
}

/** Repeated decisions must agree with the first; the unique review row makes the first win. */
function matchDecision(review: CourseAgentReview, decision: 'approved' | 'denied') {
  if (review.decision !== decision) {
    throw new HttpStatusError(409, 'This review already has a different decision.');
  }
  return { decision };
}

export async function postReviewDecision({
  course: courseContext,
  conversation,
  user,
  authzData,
  reviewId,
  decision,
}: {
  course: Pick<Course, 'id'>;
  conversation: CourseAgentConversation;
  user: User;
  authzData: { has_course_permission_edit: boolean; authn_user: Pick<User, 'id'> };
  reviewId: string;
  decision: 'approved' | 'denied';
}) {
  const key = { course_agent_conversation_id: conversation.id, agent_review_id: reviewId };
  const existing = await selectOptionalCourseAgentReview(key);
  if (existing) return matchDecision(existing, decision);
  const review = await getCourseAgentReview(conversation.agent_conversation_id, reviewId);
  if (!review) throw new HttpStatusError(409, 'This review is no longer pending.');
  if (decision === 'denied') {
    const row = await insertCourseAgentReview({
      ...key,
      decision,
      job_sequence_id: null,
      result: DENIED,
    });
    if (!row) return matchDecision((await selectOptionalCourseAgentReview(key))!, decision);
    await deliverResult(conversation, row, DENIED);
    return { decision };
  }
  const course = await selectCourseById(courseContext.id);
  verifyReviewBinding(course, review.snapshot);
  const locals = { course, user, authz_data: authzData };
  const container = { rootPath: course.path, invalidRootPaths: [path.join(course.path, '.git')] };
  const editor = new MultiEditor({ locals, description: jobDescriptions[review.snapshot.type] }, [
    new FileUploadEditor({
      locals,
      container,
      files: Object.fromEntries(
        review.snapshot.additions.map((file) => [
          path.join(course.path, file.path),
          Buffer.from(file.contents, 'base64'),
        ]),
      ),
    }),
    ...review.snapshot.deletions.map(
      (file) =>
        new FileDeleteEditor({ locals, container, deletePath: path.join(course.path, file.path) }),
    ),
  ]);
  const serverJob = await editor.prepareServerJob();
  const row = await insertCourseAgentReview({
    ...key,
    decision,
    job_sequence_id: serverJob.jobSequenceId,
    result: null,
  });
  if (!row) {
    // A concurrent decision won; this job must never run.
    await serverJob.executeUnsafe(async (job) => {
      job.stop('Another decision for this review was recorded first.');
    });
    return matchDecision((await selectOptionalCourseAgentReview(key))!, decision);
  }
  void applyChanges(editor, serverJob, course, conversation, row, review);
  return { decision };
}

async function applyChanges(
  editor: MultiEditor,
  serverJob: ServerJobExecutor,
  course: Course,
  conversation: CourseAgentConversation,
  row: CourseAgentReview,
  review: Review,
) {
  const snapshot = review.snapshot;
  try {
    try {
      // Local development saves overwrite the files on disk, which the reviewed diff was built from.
      await editor.executeWithServerJob(
        serverJob,
        snapshot.type === 'github'
          ? { beforeWrite: (job) => checkReviewConflicts(course, snapshot, job) }
          : {},
      );
    } catch {
      // The editor has already persisted the failure and save/sync flags in its job.
    }
    const sequence = await getJobSequence(serverJob.jobSequenceId, conversation.course_id);
    await recordAndDeliverResult(conversation, row, getReviewJobResult(sequence, snapshot.type));
  } catch (error) {
    logger.error('Course agent review result was not recorded; it will be retried.', error);
    Sentry.captureException(error);
  }
}

// A Worker restart or deploy delays delivery briefly; only a result that stays stuck is a fault.
const STUCK_DELIVERY_MS = 60 * 60 * 1000;

function reportStuckDelivery(row: CourseAgentReview, error: unknown) {
  if (Date.now() - row.created_at.getTime() > STUCK_DELIVERY_MS) Sentry.captureException(error);
}

/** Record a result once; whichever caller records it first decides what the agent receives. */
async function recordAndDeliverResult(
  conversation: CourseAgentConversation,
  row: CourseAgentReview,
  result: RequestChangesResult,
) {
  const recorded = await updateCourseAgentReviewResult({ id: row.id, result });
  return recorded ? await deliverResult(conversation, recorded, result) : true;
}

/**
 * A failed send leaves the result undelivered for the sweeper or Resume to retry. Returns false
 * when the service did not answer, so the sweeper can stop instead of waiting out each timeout.
 */
async function deliverResult(
  conversation: CourseAgentConversation,
  row: CourseAgentReview,
  result: RequestChangesResult,
) {
  try {
    await deliverCourseAgentReviewResult(
      conversation.agent_conversation_id,
      row.agent_review_id,
      result,
    );
    await updateCourseAgentReviewDelivered(row.id);
    return true;
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 409) {
      // Retrying cannot change the service's answer, so stop sending this result.
      logger.error('Course agent service refused the review result.', error);
      Sentry.captureException(error);
      await updateCourseAgentReviewDelivered(row.id);
      return true;
    }
    logger.error('Course agent review result was not delivered; it will be retried.', error);
    reportStuckDelivery(row, error);
    return false;
  }
}

/** Map a finished editor job to the result the agent receives. */
export function getReviewJobResult(
  sequence: JobSequenceWithTokens,
  mode: ReviewSnapshot['type'],
): RequestChangesResult {
  const job = sequence.jobs[0];
  const data: Record<string, unknown> = job.data;
  // The agent receives these logs as its tool result; a large course's sync log ends with the errors.
  const diagnostics = stripVTControlCharacters(job.output ?? '').slice(-MAX_DIAGNOSTICS_LENGTH);
  if (job.status === 'Running' || job.status === 'Stopping') {
    throw new HttpStatusError(409, 'The changes are still being saved. Try again shortly.');
  }
  // A stopped job still records how far it got, like a failed one, so the agent can continue.
  if (data.courseAgentConflict) {
    const { paths } = ReviewConflictSchema.parse(data.courseAgentConflict);
    return {
      decision: 'approved',
      publication: { status: 'conflict', paths },
      sync: { status: 'not_attempted' },
    };
  }
  if (!data.saveSucceeded) {
    return {
      decision: 'approved',
      publication: { status: 'failed', error: diagnostics },
      sync: { status: 'not_attempted' },
    };
  }
  return {
    decision: 'approved',
    publication: { status: mode === 'github' ? 'published' : 'saved_locally' },
    sync: data.syncSucceeded ? { status: 'succeeded' } : { status: 'failed', error: diagnostics },
  };
}

/**
 * Send every result the service has not acknowledged. A result missing because PrairieLearn
 * stopped while saving is rebuilt from the finished job; a job still running is left for later.
 */
export async function deliverUndeliveredReviewResults(conversationId: string | null = null) {
  if (!config.courseAgentServiceUrl) return;
  const rows = await selectUndeliveredCourseAgentReviews({
    course_agent_conversation_id: conversationId,
  });
  for (const { review: row, conversation } of rows) {
    // An unreachable service would fail every later row too, so the sweep stops and the next
    // one retries. Other failures only skip their own row.
    if (!(await deliverUndeliveredReviewResult(conversation, row))) return;
  }
}

/** Returns false when the course agent service did not answer. */
async function deliverUndeliveredReviewResult(
  conversation: CourseAgentConversation,
  row: CourseAgentReview,
) {
  try {
    if (row.result !== null) {
      return await deliverResult(conversation, row, RequestChangesResultSchema.parse(row.result));
    }
    // Only approvals wait for a result, and the schema requires each to have a job.
    if (row.job_sequence_id === null) throw new Error('Approved review has no job');
    const sequence = await getJobSequence(row.job_sequence_id, conversation.course_id);
    if (sequence.jobs[0].status === 'Running' || sequence.jobs[0].status === 'Stopping') {
      return true;
    }
    let review: Review | null;
    try {
      // The snapshot is retained until its result is delivered, so its mode is still available.
      review = await getCourseAgentReview(conversation.agent_conversation_id, row.agent_review_id);
    } catch (error) {
      logger.error('Course agent review could not be loaded; it will be retried.', error);
      reportStuckDelivery(row, error);
      return false;
    }
    if (!review) return true;
    return await recordAndDeliverResult(
      conversation,
      row,
      getReviewJobResult(sequence, review.snapshot.type),
    );
  } catch (error) {
    logger.error('Course agent review result delivery failed; it will be retried.', error);
    reportStuckDelivery(row, error);
    return true;
  }
}

/** Resume first sends any unacknowledged results, then asks the agent to repair and continue. */
export async function resumeConversation(conversation: CourseAgentConversation) {
  await deliverUndeliveredReviewResults(conversation.id);
  return resumeCourseAgentConversation(conversation.agent_conversation_id);
}
