/**
 * Local editing writes the approved files and syncs from disk. Git editing writes,
 * commits, and pushes the approved files, then syncs from disk. Both use the editor's job.
 */
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import {
  type PendingReview,
  type RequestChangesResult,
  type ReviewSnapshot,
  SavedJobOutcomeSchema,
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
} from './client.js';
import { ReviewConflictSchema, checkReviewConflicts } from './review-conflicts.js';
import { createReviewDiff } from './review-diff.js';

const jobDescriptions = {
  local: 'Save and sync reviewed local course edits',
  github: 'Publish and sync reviewed course edits',
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
    error: review.error,
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
      result: {
        decision,
        publication: { status: 'not_attempted' },
        sync: { status: 'not_attempted' },
      },
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
  try {
    try {
      await editor.executeWithServerJob(serverJob, {
        beforeWrite: (job) => checkReviewConflicts(course, review.snapshot, job),
      });
    } catch {
      // The editor has already persisted the failure and save/sync flags in its job.
    }
    const sequence = await getReviewJob(conversation, serverJob.jobSequenceId);
    const outcome = getReviewJobOutcome(sequence);
    if (outcome.result) {
      await deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
        callId: review.callId,
        result: outcome.result,
        conflictFiles: outcome.conflictFiles,
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
    !Object.values(jobDescriptions).includes(sequence.description ?? '') ||
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
  const conflict = data.courseAgentConflict
    ? ReviewConflictSchema.parse(data.courseAgentConflict)
    : null;
  let result: RequestChangesResult | null = null;
  if (job.status === 'Success' || job.status === 'Error') {
    let publication: RequestChangesResult['publication'];
    let sync: RequestChangesResult['sync'];
    if (conflict) {
      publication = { status: 'conflict', paths: conflict.paths };
      sync = { status: 'not_attempted' };
    } else if (!data.saveSucceeded) {
      publication = { status: 'failed', error: diagnostics };
      sync = { status: 'not_attempted' };
    } else {
      // The description retains the selected mode for Resume, even if configuration changes.
      if (sequence.description === jobDescriptions.github) {
        publication = { status: 'published' };
      } else {
        publication = { status: 'saved_locally' };
      }
      if (data.syncSucceeded) {
        sync = { status: 'succeeded' };
      } else {
        sync = { status: 'failed', error: diagnostics };
      }
    }
    result = { decision: 'approved', publication, sync };
  }
  let status: 'running' | 'completed' | 'blocked';
  let error: string | null = null;
  if (running) {
    status = 'running';
  } else if (result) {
    status = 'completed';
  } else {
    status = 'blocked';
    error = diagnostics || 'Saving was interrupted. Inspect the job before retrying.';
  }
  return SavedJobOutcomeSchema.parse({
    jobSequenceId: sequence.id,
    status,
    result,
    conflictFiles: conflict?.files,
    error,
  });
}
