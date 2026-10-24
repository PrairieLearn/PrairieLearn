import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { execa } from 'execa';
import { z } from 'zod';

import {
  type PendingReview,
  type PushSyncResult,
  type ReviewOutcome,
  ReviewOutcomeSchema,
  reviewRevision,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import * as namedLocks from '@prairielearn/named-locks';
import { contains } from '@prairielearn/path-utils';
import { execute, loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';
import { checkSignedToken, generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import {
  type Course,
  type CourseAgentConversation,
  CourseSchema,
  JobSchema,
  type User,
} from '../../../lib/db-types.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { insertAuditEvent } from '../../../models/audit-event.js';
import {
  getLockNameForCoursePath,
  selectCourseById,
  updateCourseCommitHash,
} from '../../../models/course.js';
import { syncDiskToSqlWithLock } from '../../../sync/syncFromDisk.js';

import { deliverCourseAgentReviewOutcome, getCourseAgentPendingReview } from './client.js';

const sql = loadSqlEquiv(import.meta.url);
const gitEnv = () => ({
  ...process.env,
  ...(config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {}),
});

function claims(conversation: CourseAgentConversation, review: PendingReview, reviewerId: string) {
  return {
    purpose: 'course_agent_review',
    conversationId: conversation.id,
    courseId: conversation.course_id,
    reviewerId,
    callId: review.callId,
    revision: review.revision,
  };
}

/** Confirm the destination and digest before parsing any untrusted patch. */
async function verifyBinding(course: Pick<Course, 'repository' | 'branch'>, review: PendingReview) {
  const repository = parseGithubRepository(course.repository ?? '');
  if (
    !repository ||
    `${repository.owner}/${repository.repo}` !== review.repository ||
    course.branch !== review.branch ||
    (await reviewRevision(review.baseCommit, review.patch)) !== review.revision
  ) {
    throw new HttpStatusError(
      409,
      'The course repository or reviewed changes have changed. Reload the review.',
    );
  }
}

/** Apply to a disposable clean clone; Git validates paths before anything reaches the course. */
async function withReviewedCheckout<T>(
  course: Pick<Course, 'repository' | 'branch'>,
  review: PendingReview,
  fn: (dir: string) => Promise<T>,
  requireCurrentHead = false,
) {
  await verifyBinding(course, review);
  const dir = await mkdtemp(path.join(tmpdir(), 'course-agent-review-'));
  try {
    const checkout = path.join(dir, 'course');
    const git = (args: string[]) =>
      execa('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
        cwd: checkout,
        env: gitEnv(),
        timeout: 60_000,
      });
    await execa(
      'git',
      [
        'clone',
        '--no-checkout',
        '--single-branch',
        '--branch',
        review.branch,
        '--',
        course.repository!,
        checkout,
      ],
      { env: gitEnv(), timeout: 60_000 },
    );
    const head = (await git(['rev-parse', 'HEAD'])).stdout;
    if (requireCurrentHead && head !== review.baseCommit) {
      throw new HttpStatusError(
        409,
        'The course branch changed since these edits started. Ask the agent to review the latest course.',
      );
    }
    await git(['checkout', '--detach', review.baseCommit]);
    const patchFile = path.join(dir, 'changes.patch');
    await writeFile(patchFile, review.patch);
    await git([
      '-c',
      'core.autocrlf=false',
      'apply',
      '--index',
      '--whitespace=nowarn',
      '--',
      patchFile,
    ]);
    const entries = (await git(['ls-files', '--stage', '-z'])).stdout.split('\0').filter(Boolean);
    for (const entry of entries) {
      const mode = entry.slice(0, 6);
      const file = entry.slice(entry.indexOf('\t') + 1);
      if (
        !['100644', '100755'].includes(mode) ||
        file.split('/').some((part) => part.toLowerCase() === '.git' || part === '..') ||
        file.includes('\\')
      ) {
        throw new HttpStatusError(400, `Unsupported course file: ${file}`);
      }
    }
    return await fn(checkout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function getPendingReview(
  course: Pick<Course, 'repository' | 'branch'>,
  conversation: CourseAgentConversation,
  reviewerId: string,
) {
  const review = await getCourseAgentPendingReview(conversation.agent_conversation_id);
  if (!review) return null;
  const diff = await withReviewedCheckout(course, review, async (cwd) => {
    const result = await execa(
      'git',
      [
        '-c',
        'core.quotePath=true',
        'diff',
        '--cached',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        review.baseCommit,
        '--',
      ],
      { cwd, env: gitEnv() },
    );
    return { patch: result.stdout };
  });
  return {
    card: review.card,
    reviewToken: generateSignedToken(claims(conversation, review, reviewerId), config.secretKey),
    diff,
  };
}

/** A failed delivery retries the saved result, never publication. */
export async function retryReviewDeliveries() {
  const rows = await queryRows(
    sql.select_pending_deliveries,
    {},
    z.object({ job: JobSchema, course: CourseSchema }),
  );
  for (const { job, course } of rows) {
    try {
      const data = z
        .object({
          agentConversationId: z.string(),
          callId: z.string(),
          revision: z.string(),
          repository: z.string(),
          branch: z.string(),
          expectedCommit: z.string().optional(),
          pushAttempted: z.boolean().optional(),
          outcome: ReviewOutcomeSchema.optional(),
        })
        .parse(job.data);
      if (!data.outcome) {
        const lines = [stripVTControlCharacters(job.output ?? '')];
        let publication: PushSyncResult['publication'] = {
          status: 'failed',
          error: lines.join('\n') || 'Publication job stopped before pushing changes.',
        };
        if (data.pushAttempted && data.expectedCommit) {
          const dir = await mkdtemp(path.join(tmpdir(), 'course-agent-reconcile-'));
          try {
            await execa(
              'git',
              [
                'clone',
                '--bare',
                '--single-branch',
                '--branch',
                data.branch,
                '--',
                data.repository,
                dir,
              ],
              { env: gitEnv(), timeout: 60_000 },
            );
            const object = await execa('git', ['cat-file', '-e', data.expectedCommit], {
              cwd: dir,
              env: gitEnv(),
              reject: false,
            });
            if (object.exitCode === 0) {
              const included = await execa(
                'git',
                ['merge-base', '--is-ancestor', data.expectedCommit, 'HEAD'],
                { cwd: dir, env: gitEnv(), reject: false },
              );
              if (included.exitCode !== 0 && included.exitCode !== 1) {
                throw new Error(included.stderr);
              }
              if (included.exitCode === 0) {
                publication = { status: 'published', commitSha: data.expectedCommit };
              }
            }
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        }
        let sync: PushSyncResult['sync'] = { status: 'not_attempted' };
        if (publication.status === 'published') {
          const logger = {
            info: (line: string) => lines.push(line),
            error: (line: string) => lines.push(line),
            warn: (line: string) => lines.push(line),
            verbose: (line: string) => lines.push(line),
          };
          try {
            const commitSha = publication.commitSha;
            await namedLocks.doWithLock(
              getLockNameForCoursePath(course.path),
              { timeout: 5000 },
              async () => {
                if (contains(REPOSITORY_ROOT_PATH, course.path)) {
                  throw new Error(
                    'Cannot replace a course checkout inside the PrairieLearn repository.',
                  );
                }
                if (course.repository !== data.repository || course.branch !== data.branch) {
                  throw new Error('Course repository binding changed before sync recovery.');
                }
                for (const args of [
                  ['fetch', '--', data.repository, data.branch],
                  ['reset', '--hard', commitSha],
                  ['clean', '-fd'],
                ]) {
                  const command = await execa('git', args, {
                    cwd: course.path,
                    env: gitEnv(),
                    timeout: 60_000,
                  });
                  lines.push(command.stdout);
                }
                const synced = await syncDiskToSqlWithLock(course, logger);
                await updateCourseCommitHash(course);
                if (synced.status !== 'complete' || synced.hadJsonErrors) {
                  throw new Error('Course Sync failed.');
                }
              },
            );
            sync = { status: 'succeeded' };
          } catch (error) {
            lines.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
            sync = { status: 'failed', error: stripVTControlCharacters(lines.join('\n')) };
          }
        }
        data.outcome = {
          callId: data.callId,
          revision: data.revision,
          result: { decision: 'approved', publication, sync },
        };
        await execute(sql.record_recovered_outcome, {
          job_id: job.id,
          outcome: data.outcome,
          output: lines.join('\n'),
        });
      }
      await deliverCourseAgentReviewOutcome(data.agentConversationId, data.outcome);
      await execute(sql.record_delivery, { job_id: job.id });
    } catch (error) {
      console.error(`Course agent outcome delivery failed for course ${course.id}`, error);
    }
  }
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
  user: Pick<User, 'id' | 'name' | 'email' | 'uid'>;
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
  await verifyBinding(course, review);
  if (decision === 'denied') {
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
        context: { decision, revision: review.revision },
      });
    });
    await deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
      callId: review.callId,
      revision: review.revision,
      result: {
        decision,
        publication: { status: 'not_attempted' },
        sync: { status: 'not_attempted' },
      },
    });
    return { decision, jobSequenceId: null };
  }
  // The job and deciding actor are committed together before publication starts.
  const executor = await createServerJob({
    courseId: course.id,
    userId: user.id,
    authnUserId,
    type: 'course_agent_push_sync',
    description: 'Publish and sync reviewed course edits',
    auditContext: { decision, conversationId: conversation.id, revision: review.revision },
    initialData: {
      agentConversationId: conversation.agent_conversation_id,
      callId: review.callId,
      revision: review.revision,
      repository: course.repository,
      branch: review.branch,
      callbackDelivered: false,
    },
  });
  executor.executeInBackground(async (job) => {
    const result: PushSyncResult = {
      decision: 'approved',
      publication: { status: 'not_attempted' },
      sync: { status: 'not_attempted' },
    };
    try {
      await namedLocks.doWithLock(
        getLockNameForCoursePath(course.path),
        { timeout: 5000 },
        async () => {
          try {
            const currentCourse = await selectCourseById(course.id);
            await verifyBinding(currentCourse, review);
            await withReviewedCheckout(
              currentCourse,
              review,
              async (cwd) => {
                const runGit = (args: string[]) =>
                  execa('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
                    cwd,
                    env: gitEnv(),
                    timeout: 60_000,
                  });
                await runGit([
                  '-c',
                  `user.name=${user.name}`,
                  '-c',
                  `user.email=${user.email || user.uid}`,
                  'commit',
                  '--allow-empty',
                  '-m',
                  'Apply reviewed course agent edits',
                ]);
                const commitSha = (await runGit(['rev-parse', 'HEAD'])).stdout;
                job.data.expectedCommit = commitSha;
                await job.saveData();
                job.data.pushAttempted = true;
                await job.saveData();
                try {
                  // The lease rejects a branch that changed after validation; it never rebases edits.
                  await job.exec(
                    'git',
                    [
                      'push',
                      `--force-with-lease=refs/heads/${review.branch}:${review.baseCommit}`,
                      'origin',
                      `${commitSha}:refs/heads/${review.branch}`,
                    ],
                    { cwd, env: gitEnv() },
                  );
                } catch (error) {
                  job.error(
                    error instanceof Error ? (error.stack ?? error.message) : String(error),
                  );
                  await runGit(['fetch', 'origin', review.branch]);
                  const included = await execa(
                    'git',
                    ['merge-base', '--is-ancestor', commitSha, 'FETCH_HEAD'],
                    { cwd, env: gitEnv(), reject: false },
                  );
                  if (included.exitCode !== 0 && included.exitCode !== 1) {
                    throw new Error(included.stderr, { cause: error });
                  }
                  job.data.pushSettled = true;
                  if (included.exitCode !== 0) throw error;
                }
                job.data.pushSettled = true;
                result.publication = { status: 'published', commitSha };
                job.data.publication = result.publication;
                await job.saveData();
              },
              true,
            );
          } catch (error) {
            job.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
            if (job.data.pushAttempted && !job.data.pushSettled) {
              await job.saveData();
              throw error;
            }
            result.publication = {
              status: 'failed',
              error: stripVTControlCharacters(job.output),
            };
          }
          if (result.publication.status === 'published') {
            try {
              if (contains(REPOSITORY_ROOT_PATH, course.path)) {
                throw new Error(
                  'Cannot replace a course checkout inside the PrairieLearn repository.',
                );
              }
              await job.exec('git', ['fetch', '--', course.repository!, review.branch], {
                cwd: course.path,
                env: gitEnv(),
              });
              await job.exec('git', ['reset', '--hard', result.publication.commitSha], {
                cwd: course.path,
                env: gitEnv(),
              });
              await job.exec('git', ['clean', '-fd'], { cwd: course.path, env: gitEnv() });
              const sync = await syncDiskToSqlWithLock(course, job);
              await updateCourseCommitHash(course);
              if (sync.status !== 'complete' || sync.hadJsonErrors) {
                throw new Error('Course Sync failed. See the diagnostics above.');
              }
              result.sync = { status: 'succeeded' };
            } catch (error) {
              job.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
              result.sync = { status: 'failed', error: stripVTControlCharacters(job.output) };
            }
          }
        },
      );
    } catch (error) {
      if (job.data.pushAttempted && !job.data.pushSettled) throw error;
      job.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      result.publication = { status: 'failed', error: stripVTControlCharacters(job.output) };
    }
    const outcome: ReviewOutcome = { callId: review.callId, revision: review.revision, result };
    job.data.outcome = outcome;
    await job.saveData();
    try {
      await deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, outcome);
      job.data.callbackDelivered = true;
      await job.saveData();
    } catch (error) {
      job.error(String(error));
    }
    if (result.publication.status !== 'published' || result.sync.status !== 'succeeded') {
      job.fail('Reviewed changes were not published and synced successfully.');
    }
  });
  return { decision, jobSequenceId: executor.jobSequenceId };
}
