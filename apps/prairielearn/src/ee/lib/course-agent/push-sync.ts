import { isUtf8 } from 'node:buffer';
import { stripVTControlCharacters } from 'node:util';

import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';

import {
  MAX_REVIEW_BYTES,
  MAX_REVIEW_FILE_BYTES,
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
  const { owner, repo } = verifyBinding(course, review);
  const client = githubClient();
  const { data: tree } = await client.git.getTree({
    owner,
    repo,
    tree_sha: review.snapshot.baseCommit,
    recursive: '1',
  });
  if (tree.truncated) {
    throw new HttpStatusError(
      400,
      'This repository is too large to review through the course agent.',
    );
  }
  const entries = new Map(tree.tree.map((entry) => [entry.path, entry]));
  const additions = new Map(review.snapshot.additions.map((file) => [file.path, file.contents]));
  const patches: string[] = [];
  let total = 0;
  for (const file of [...review.snapshot.additions, ...review.snapshot.deletions]) {
    const entry = entries.get(file.path);
    if (entry && (entry.type !== 'blob' || entry.mode !== '100644')) {
      throw new HttpStatusError(
        400,
        `Only non-executable regular files are supported: ${file.path}`,
      );
    }
    if (!entry && !additions.has(file.path)) {
      throw new HttpStatusError(400, `Deleted file does not exist: ${file.path}`);
    }
    if ((entry?.size ?? 0) > MAX_REVIEW_FILE_BYTES) {
      throw new HttpStatusError(400, `Review file is too large: ${file.path}`);
    }
    const old = entry
      ? Buffer.from(
          (await client.git.getBlob({ owner, repo, file_sha: entry.sha })).data.content,
          'base64',
        )
      : Buffer.alloc(0);
    const contents = additions.get(file.path);
    const next = contents === undefined ? Buffer.alloc(0) : Buffer.from(contents, 'base64');
    total += old.length + next.length;
    if (total > MAX_REVIEW_BYTES) throw new HttpStatusError(400, 'Reviewed changes are too large.');
    if (old.includes(0) || next.includes(0) || !isUtf8(old) || !isUtf8(next)) {
      patches.push(
        `Binary file ${file.path}: ${entry ? (contents === undefined ? 'deleted' : 'modified') : 'added'}\n`,
      );
    } else {
      patches.push(
        createTwoFilesPatch(
          entry ? file.path : '/dev/null',
          contents === undefined ? '/dev/null' : file.path,
          old.toString('utf8'),
          next.toString('utf8'),
        ),
      );
    }
  }
  return {
    callId: review.callId,
    card: review.card,
    status: review.status,
    jobSequenceId: review.jobSequenceId,
    error: review.error,
    reviewToken: generateSignedToken(claims(conversation, review, reviewerId), config.secretKey),
    diff: { patch: patches.join('\n') },
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
    .execute(async (job) => {
      job.data.agentConversationId = conversation.agent_conversation_id;
      job.data.callId = review.callId;
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
      const result: PushSyncResult = {
        decision,
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
            const head = (
              await client.repos.getBranch({ owner, repo, branch: review.snapshot.branch })
            ).data.commit.sha;
            if (head !== review.snapshot.baseCommit) {
              throw new Error(
                'The course branch changed. Ask the agent to fetch updates and request a new review.',
              );
            }
            publication.attempted = true;
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
            result.publication = { status: 'published', commitSha };
            job.info(`Published ${commitSha}`);
            try {
              if (contains(REPOSITORY_ROOT_PATH, current.path)) {
                throw new Error(
                  'Cannot replace a course checkout inside the PrairieLearn repository.',
                );
              }
              const env = {
                ...process.env,
                ...(config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {}),
              };
              await job.exec('git', ['fetch', '--', current.repository!, review.snapshot.branch], {
                cwd: current.path,
                env,
              });
              await job.exec('git', ['reset', '--hard', commitSha], { cwd: current.path, env });
              await job.exec('git', ['clean', '-fd'], { cwd: current.path, env });
              const sync = await syncDiskToSqlWithLock(current, syncLogger);
              await updateCourseCommitHash(current);
              if (sync.status !== 'complete' || sync.hadJsonErrors) {
                throw new Error('Course Sync failed. See the diagnostics above.');
              }
              result.sync = { status: 'succeeded' };
            } catch (error) {
              syncLogger.error(error instanceof Error ? error.message : String(error));
              result.sync = { status: 'failed', error: stripVTControlCharacters(lines.join('\n')) };
            }
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
    })
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
