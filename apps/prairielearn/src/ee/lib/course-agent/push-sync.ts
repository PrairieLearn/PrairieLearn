import { stripVTControlCharacters } from 'node:util';

import { z } from 'zod';

import {
  type PendingReview,
  type PushSyncResult,
  PushSyncResultSchema,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as namedLocks from '@prairielearn/named-locks';
import { contains } from '@prairielearn/path-utils';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { checkSignedToken, generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import type { Course, CourseAgentConversation, User } from '../../../lib/db-types.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import { getGithubClient } from '../../../lib/github.js';
import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';
import {
  type ServerJob,
  type ServerJobLogger,
  createServerJob,
  selectJobsByJobSequenceId,
} from '../../../lib/server-jobs.js';
import { insertAuditEvent } from '../../../models/audit-event.js';
import {
  getLockNameForCoursePath,
  selectCourseById,
  updateCourseCommitHash,
} from '../../../models/course.js';
import { syncDiskToSqlWithLock } from '../../../sync/syncFromDisk.js';

import {
  deliverCourseAgentReviewOutcome,
  getCourseAgentPendingReview,
  recordCourseAgentReviewDecision,
} from './client.js';
import { createReviewDiff } from './review-diff.js';

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
  const repository = parseGithubRepository(course.repository ?? '');
  if (
    !repository ||
    `${repository.owner}/${repository.repo}` !== review.snapshot.repository ||
    course.branch !== review.snapshot.branch
  ) {
    throw new HttpStatusError(409, 'The course repository or branch changed. Start a new review.');
  }
  return repository;
}

function githubClient() {
  const client = getGithubClient();
  if (!client) throw new HttpStatusError(503, 'GitHub API publication is not configured.');
  return client;
}

/** Generate the review from immutable base blobs and saved bytes, without a checkout. */
export async function getPendingReview(
  course: Pick<Course, 'repository' | 'branch'>,
  conversation: CourseAgentConversation,
  reviewerId: string,
  callId: string,
) {
  const review = await getCourseAgentPendingReview(conversation.agent_conversation_id);
  if (review?.callId !== callId) return null;
  const repository = verifyBinding(course, review);
  const patch = await createReviewDiff(githubClient(), repository, review.snapshot);
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
  reviewToken,
  decision,
}: {
  course: Pick<Course, 'id'>;
  conversation: CourseAgentConversation;
  user: Pick<User, 'id'>;
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
    if ((decision === 'approved') !== (review.jobSequenceId !== null)) {
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
    await runInTransactionAsync(async () => {
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
      description: 'Publish and sync reviewed course edits',
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
      job.data.error = 'Publication was not started. Inspect the review before continuing.';
      job.stop(String(job.data.error));
    });
    throw error;
  }
  // execute() persists ordinary job data before the callback is attempted.
  void executor
    .execute((job) => executePushSync(job, course, conversation, review))
    .then(async ({ data }) => {
      const result = PushSyncResultSchema.safeParse(data.result);
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

/** Publish once, then sync PL's checkout; retain the outcome in the ordinary job record. */
async function executePushSync(
  job: ServerJob,
  course: Course,
  conversation: CourseAgentConversation,
  review: PendingReview,
) {
  job.data.agentConversationId = conversation.agent_conversation_id;
  job.data.callId = review.callId;
  const result: PushSyncResult = {
    decision: 'approved',
    publication: { status: 'not_attempted' },
    sync: { status: 'not_attempted' },
  };
  const publication = { attempted: false };
  try {
    await namedLocks.doWithLock(
      getLockNameForCoursePath(course.path),
      { timeout: 5000 },
      async () => {
        const current = await selectCourseById(course.id);
        const { owner, repo } = verifyBinding(current, review);
        const client = githubClient();
        const head = (await client.repos.getBranch({ owner, repo, branch: review.snapshot.branch }))
          .data.commit.sha;
        if (head !== review.snapshot.baseCommit) {
          throw new Error(
            'The course branch changed. Ask the agent to fetch updates and request a new review.',
          );
        }
        publication.attempted = true;
        const commitSha = await publishReviewedFiles(client, review);
        result.publication = { status: 'published', commitSha };
        job.info(`Published ${commitSha}`);
        result.sync = await syncPublishedCourse(current, review.snapshot.branch, commitSha, job);
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (publication.attempted && result.publication.status !== 'published') {
      job.data.error = `GitHub publication could not be confirmed. Inspect the branch before retrying. ${message}`;
      job.fail(String(job.data.error));
    }
    if (result.publication.status === 'published') {
      result.sync = { status: 'failed', error: message };
    } else {
      result.publication = { status: 'failed', error: message };
    }
  }
  job.data.result = result;
  if (result.publication.status !== 'published' || result.sync.status !== 'succeeded') {
    job.fail('Reviewed changes were not published and synced successfully.');
  }
}

async function publishReviewedFiles(
  client: ReturnType<typeof githubClient>,
  review: PendingReview,
) {
  const published = await client.graphql<{
    createCommitOnBranch: { commit: { oid: string } };
  }>(
    `
mutation PublishCourseEdits($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}
    `,
    {
      input: {
        branch: {
          repositoryNameWithOwner: review.snapshot.repository,
          branchName: review.snapshot.branch,
        },
        expectedHeadOid: review.snapshot.baseCommit,
        message: { headline: 'Apply reviewed course agent edits' },
        fileChanges: {
          additions: review.snapshot.additions,
          deletions: review.snapshot.deletions,
        },
      },
    },
  );
  const commitSha = z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .parse(published.createCommitOnBranch.commit.oid);
  return commitSha;
}

async function syncPublishedCourse(
  course: Course,
  branch: string,
  commitSha: string,
  job: ServerJob,
): Promise<PushSyncResult['sync']> {
  const lines: string[] = [];
  const log = (method: keyof ServerJobLogger, line: string) => {
    lines.push(line);
    job[method](line);
  };
  const syncLogger: ServerJobLogger = {
    info: (line) => log('info', line),
    error: (line) => log('error', line),
    warn: (line) => log('warn', line),
    verbose: (line) => log('verbose', line),
  };
  try {
    if (contains(REPOSITORY_ROOT_PATH, course.path)) {
      throw new Error('Cannot replace a course checkout inside the PrairieLearn repository.');
    }
    const env = {
      ...process.env,
      ...(config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {}),
    };
    await job.exec('git', ['fetch', '--', course.repository!, branch], {
      cwd: course.path,
      env,
    });
    await job.exec('git', ['reset', '--hard', commitSha], { cwd: course.path, env });
    await job.exec('git', ['clean', '-fd'], { cwd: course.path, env });
    const sync = await syncDiskToSqlWithLock(course, syncLogger);
    await updateCourseCommitHash(course);
    if (sync.status !== 'complete' || sync.hadJsonErrors) {
      throw new Error('Course Sync failed. See the diagnostics above.');
    }
    return { status: 'succeeded' };
  } catch (error) {
    syncLogger.error(error instanceof Error ? error.message : String(error));
    return { status: 'failed', error: stripVTControlCharacters(lines.join('\n')) };
  }
}
