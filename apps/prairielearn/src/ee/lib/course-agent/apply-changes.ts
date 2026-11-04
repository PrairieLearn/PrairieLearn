/**
 * Local editing writes the approved files and syncs from disk. Git editing writes,
 * commits, and pushes the approved files, then syncs from disk. Both use the editor's job.
 */
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import type {
  PendingReview,
  RequestChangesResult,
  ReviewSnapshot,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import { config } from '../../../lib/config.js';
import type { Course, CourseAgentConversation, User } from '../../../lib/db-types.js';
import { FileDeleteEditor, FileUploadEditor, MultiEditor } from '../../../lib/editors.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import { type ServerJobExecutor, getJobSequence } from '../../../lib/server-jobs.js';
import type { JobSequenceWithTokens } from '../../../lib/server-jobs.types.js';
import { selectCourseById } from '../../../models/course.js';

import {
  deliverCourseAgentReviewOutcome,
  getCourseAgentPendingReview,
  recordCourseAgentReviewDecision,
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

/** Generate the review from immutable local Git objects and saved bytes. */
export async function getPendingReview(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  conversation: CourseAgentConversation,
  callId: string,
) {
  const review = await getCourseAgentPendingReview(conversation.agent_conversation_id);
  if (review?.callId !== callId) return null;
  let diff: { patch: string | null; error: string | null };
  try {
    verifyReviewBinding(course, review.snapshot);
    diff = { patch: await createReviewDiff(course, review.snapshot), error: null };
  } catch (error) {
    // A broken diff must not hide the pending review or prevent its owner from denying it.
    if (!(error instanceof HttpStatusError)) logger.error('Course agent review diff failed', error);
    diff = {
      patch: null,
      error: error instanceof Error ? error.message : 'Could not load the reviewed changes.',
    };
  }
  return {
    callId: review.callId,
    request_changes_tool_part: review.request_changes_tool_part,
    status: review.status,
    jobSequenceId: review.jobSequenceId,
    diff,
  };
}

export async function postReviewDecision({
  course: courseContext,
  conversation,
  user,
  authzData,
  callId,
  decision,
}: {
  course: Pick<Course, 'id'>;
  conversation: CourseAgentConversation;
  user: User;
  authzData: { has_course_permission_edit: boolean; authn_user: Pick<User, 'id'> };
  callId: string;
  decision: 'approved' | 'denied';
}) {
  const course = await selectCourseById(courseContext.id);
  const review = await getCourseAgentPendingReview(conversation.agent_conversation_id);
  if (review?.callId !== callId) {
    throw new HttpStatusError(409, 'This review has changed. Reload it before deciding.');
  }
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
      result: DENIED,
    });
    return { decision, jobSequenceId: null };
  }
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
  void applyChanges(editor, serverJob, course, conversation, review);
  return { decision, jobSequenceId: serverJob.jobSequenceId };
}

async function applyChanges(
  editor: MultiEditor,
  serverJob: ServerJobExecutor,
  course: Course,
  conversation: CourseAgentConversation,
  review: PendingReview,
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
    await deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
      callId: review.callId,
      result: getReviewJobResult(sequence, snapshot.type),
    });
  } catch (error) {
    logger.error(
      'Course agent outcome delivery failed; Resume can deliver the saved job outcome.',
      error,
    );
  }
}

export async function getReviewJob(conversation: CourseAgentConversation, jobSequenceId: string) {
  const sequence = await getJobSequence(jobSequenceId, conversation.course_id);
  if (sequence.authn_user_id !== conversation.user_id) {
    throw new HttpStatusError(404, 'Job not found.');
  }
  return sequence;
}

/**
 * Map a finished editor job to the result the agent receives. The pending review, not the job,
 * identifies which job belongs to it and whether it saved locally or published.
 */
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
 * Resume first delivers a decided review whose result never reached the agent, rebuilding an
 * approval's result from its job. Otherwise it asks the agent to repair its sandbox.
 */
export async function resumeConversation(conversation: CourseAgentConversation) {
  const review = await getCourseAgentPendingReview(conversation.agent_conversation_id);
  if (review?.status === 'running') {
    const result =
      review.jobSequenceId === null
        ? DENIED
        : getReviewJobResult(
            await getJobSequence(review.jobSequenceId, conversation.course_id),
            review.snapshot.type,
          );
    await deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
      callId: review.callId,
      result,
    });
    return { recovered: true as const };
  }
  return resumeCourseAgentConversation(conversation.agent_conversation_id);
}
