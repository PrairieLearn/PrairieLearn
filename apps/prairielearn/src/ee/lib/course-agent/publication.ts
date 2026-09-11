import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import stripAnsi from 'strip-ansi';

import type {
  CourseAgentPushPayload,
  CourseAgentPushApproval as WorkerApproval,
} from '@prairielearn/course-agent-protocol';
import { doWithLock } from '@prairielearn/named-locks';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { type AuthzData, makePageAuthzData } from '../../../lib/authz-data-lib.js';
import { config } from '../../../lib/config.js';
import type { Course, CourseAgentPushApproval, User } from '../../../lib/db-types.js';
import { Editor, classifyEditOutcome } from '../../../lib/editors.js';
import { selectJobsByJobSequenceId } from '../../../lib/server-jobs.js';
import {
  selectOptionalCourseAgentPushApproval,
  updateCourseAgentPushApproval,
  upsertCourseAgentPushApproval,
} from '../../../models/course-agent.js';
import { getCourseCommitHash } from '../../../models/course.js';
import {
  courseDataHasErrors,
  loadFullCourse,
  writeErrorsAndWarningsForCourseData,
} from '../../../sync/course-db.js';
import { validateHTML } from '../validateHTML.js';

import { respondToCourseAgentPushApproval } from './ephemeral-runtime.js';

export function courseAgentErrorMessage(error: unknown) {
  return stripAnsi(error instanceof Error ? error.message : String(error))
    .replaceAll(/(https?:\/\/)[^/\s@]+@/g, '$1[redacted]@')
    .replaceAll(/\b(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]')
    .replaceAll(/(authorization:\s*(?:bearer|basic)\s+)\S+/gi, '$1[redacted]');
}

async function prepareCourseAgentApproval({
  proposal,
  course,
  conversationId,
  runId,
  userId,
}: {
  proposal: WorkerApproval;
  course: Course;
  conversationId: string;
  runId: string;
  userId: string;
}) {
  return doWithLock(`course-agent-approval:${proposal.id}`, { autoRenew: true }, async () => {
    const existing = await selectOptionalCourseAgentPushApproval({
      approvalId: proposal.id,
      courseId: course.id,
      userId,
    });
    if (existing) return existing;
    let failure: string | null = null;
    try {
      await validateCourseAgentProposal(course, proposal);
    } catch (error) {
      failure = courseAgentErrorMessage(error);
    }
    return runInTransactionAsync(async () => {
      const approval = await upsertCourseAgentPushApproval({
        approval: proposal,
        conversationId,
        runId,
        courseId: course.id,
        userId,
        repository: course.repository!,
      });
      if (failure) {
        const result = { message: failure, published: false };
        await updateCourseAgentPushApproval({
          approvalId: approval.id,
          status: 'failed',
          expectedStatuses: ['pending'],
          decidedBy: null,
          result,
        });
        return { ...approval, status: 'failed' as const, result };
      }
      return approval;
    });
  });
}

export async function validateCourseAgentProposal(
  course: Pick<Course, 'id' | 'path' | 'branch' | 'repository'>,
  proposal: CourseAgentPushPayload,
) {
  if (proposal.branch !== course.branch) throw new Error('The configured course branch changed.');
  if (!proposal.diff.trim()) throw new Error('The proposed diff is empty.');
  if (!course.repository) throw new Error('The configured course repository is missing.');
  const remote = await execa(
    'git',
    ['ls-remote', '--', course.repository, `refs/heads/${course.branch}`],
    {
      env: config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {},
      timeout: 30_000,
    },
  );
  if (remote.stdout.trim().split(/\s+/, 1)[0] !== proposal.baseSha) {
    throw new Error(
      'The remote branch changed. Fetch and reconcile the workspace before requesting approval again.',
    );
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'pl-course-agent-validation-'));
  const checkout = path.join(directory, 'course');
  const env = {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_LFS_SKIP_SMUDGE: '1',
  };
  try {
    // Borrow local Git objects without modifying the live checkout or contacting the remote.
    await execa('git', ['clone', '--shared', '--no-checkout', '--', course.path, checkout], {
      env,
    });
    const base = await execa('git', ['cat-file', '-e', `${proposal.baseSha}^{commit}`], {
      cwd: checkout,
      env,
      reject: false,
    });
    if (base.exitCode !== 0 && course.repository) {
      await execa('git', ['fetch', '--no-tags', '--', course.repository, course.branch], {
        cwd: checkout,
        env: { ...env, ...(config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {}) },
        timeout: 30_000,
      });
    }
    await execa('git', ['checkout', '--detach', proposal.baseSha], { cwd: checkout, env });
    await execa('git', ['apply', '--index', '--binary', '-'], {
      cwd: checkout,
      env,
      input: proposal.diff,
    });
    const tree = await execa('git', ['write-tree'], { cwd: checkout, env });
    if (tree.stdout.trim() !== proposal.treeSha) {
      throw new Error('The proposed diff does not match the proposed Git tree.');
    }
    const files = await execa('git', ['ls-files', '--stage'], { cwd: checkout, env });
    if (files.stdout.split('\n').some((line) => line.startsWith('120000 '))) {
      throw new Error(
        'Course validation cannot follow symbolic links. Use files within the course repository.',
      );
    }
    const data = await loadFullCourse(course.id, checkout);
    if (courseDataHasErrors(data)) {
      const lines: string[] = [];
      writeErrorsAndWarningsForCourseData(course.id, data, (line = '') => lines.push(line));
      throw new Error(`Course validation failed before approval:\n${stripAnsi(lines.join('\n'))}`);
    }
    const changed = await execa(
      'git',
      ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'],
      { cwd: checkout, env },
    );
    const questionDirectories = new Set(
      changed.stdout
        .split('\0')
        .filter(
          (file) =>
            file.startsWith('questions/') &&
            ['question.html', 'server.py', 'info.json'].includes(path.basename(file)),
        )
        .map((file) => path.dirname(file)),
    );
    for (const directory of questionDirectories) {
      const html = await readFile(path.join(checkout, directory, 'question.html'), 'utf8');
      const hasServer = await access(path.join(checkout, directory, 'server.py')).then(
        () => true,
        () => false,
      );
      const validation = await validateHTML(html, hasServer);
      if (validation.errors.length > 0) {
        throw new Error(
          `Question HTML validation failed before approval (${directory}):\n${validation.errors.join('\n')}`,
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export class CourseAgentPublicationError extends Error {
  constructor(
    message: string,
    readonly published: boolean,
    readonly jobSequenceId: string,
    readonly commitSha: string | null,
    cause: unknown,
  ) {
    super(message, { cause });
  }
}

export function validateCourseAgentPublication(
  approval: Pick<CourseAgentPushApproval, 'repository' | 'branch' | 'base_sha' | 'diff'>,
  course: Pick<Course, 'repository' | 'branch'>,
) {
  if (approval.repository !== course.repository || approval.branch !== course.branch) {
    throw new Error(
      'The course repository or branch changed while the proposed changes were awaiting approval. Inspect the current course state, then call push_sync again.',
    );
  }
  if (!approval.diff.trim()) throw new Error('The approved diff is empty');
}

class CourseAgentDiffEditor extends Editor {
  constructor(params: {
    locals: { authz_data: AuthzData; course: Course; user: User };
    approval: CourseAgentPushApproval;
  }) {
    super({ locals: params.locals, description: 'Publish course-agent changes' });
    this.approval = params.approval;
  }

  private approval: CourseAgentPushApproval;

  async write() {
    let head = (await execa('git', ['rev-parse', 'HEAD'], { cwd: this.course.path })).stdout.trim();
    if (head !== this.approval.base_sha) {
      await execa('git', ['fetch', 'origin', this.approval.branch], {
        cwd: this.course.path,
        env: config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {},
        timeout: 30_000,
      });
      const fetched = await execa('git', ['rev-parse', 'FETCH_HEAD'], { cwd: this.course.path });
      if (fetched.stdout.trim() === this.approval.base_sha) {
        await execa('git', ['merge', '--ff-only', this.approval.base_sha], {
          cwd: this.course.path,
        });
        head = this.approval.base_sha;
      }
    }
    if (head !== this.approval.base_sha) {
      throw new Error(
        `PrairieLearn's course checkout advanced while the proposed changes were awaiting approval (expected ${this.approval.base_sha}, found ${head}). Update the workspace to the latest course revision, then call push_sync again.`,
      );
    }
    await execa('git', ['apply', '--check', '--binary', '-'], {
      cwd: this.course.path,
      input: this.approval.diff,
    });
    await execa('git', ['apply', '--index', '--binary', '-'], {
      cwd: this.course.path,
      input: this.approval.diff,
    });
    return {
      pathsToAdd: ['-A'],
      commitMessage: this.approval.commit_message,
    };
  }
}

export async function publishCourseAgentApproval({
  approval,
  course,
  user,
  authzData,
}: {
  approval: CourseAgentPushApproval;
  course: Course;
  user: User;
  authzData: AuthzData;
}) {
  validateCourseAgentPublication(approval, course);
  if (!config.fileEditorUseGit) {
    throw new Error(
      'Publishing requires fileEditorUseGit. No changes were published; ask an administrator to enable Git-backed course editing.',
    );
  }
  const remote = (
    await execa('git', ['ls-remote', approval.repository, `refs/heads/${approval.branch}`], {
      env: config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {},
      timeout: 30_000,
    })
  ).stdout
    .trim()
    .split(/\s+/, 1)[0];
  if (remote !== approval.base_sha) {
    throw new Error(
      `The remote branch advanced while the proposed changes were awaiting approval (expected ${approval.base_sha}, found ${remote || 'missing'}). Update the workspace to the latest remote revision, then call push_sync again.`,
    );
  }
  const editor = new CourseAgentDiffEditor({
    locals: {
      authz_data:
        'authn_user' in authzData
          ? authzData
          : makePageAuthzData({ authzData, is_administrator: false }),
      course,
      user,
    },
    approval,
  });
  const job = await editor.prepareServerJob();
  const recorded = await updateCourseAgentPushApproval({
    approvalId: approval.id,
    status: 'publishing',
    expectedStatuses: ['publishing'],
    decidedBy: approval.decided_by,
    result: { jobSequenceId: job.jobSequenceId },
  });
  if (!recorded) throw new Error('Publication is no longer authorized. No push was attempted.');
  try {
    await editor.executeWithServerJob(job);
  } catch (error) {
    const jobs = await selectJobsByJobSequenceId(job.jobSequenceId);
    const output = stripAnsi(
      jobs
        .map((job) => job.output)
        .filter((output): output is string => output != null)
        .join('\n'),
    ).trim();
    const message = error instanceof Error ? error.message : String(error);
    const outcome = classifyEditOutcome(jobs.at(-1)?.data ?? {});
    const published = outcome === 'sync_failed' || outcome === 'sync_json_errors';
    const heading = published
      ? 'Changes were published, but course sync failed. Fix the sync errors; do not republish the same diff.'
      : 'Proposed changes were not published.';
    throw new CourseAgentPublicationError(
      `${heading}\n${message}${output ? `\n\nServer job log:\n${output}` : ''}`,
      published,
      job.jobSequenceId,
      published ? await getCourseCommitHash(course.path) : null,
      error,
    );
  }
  return {
    jobSequenceId: job.jobSequenceId,
    commitSha: await getCourseCommitHash(course.path),
    message: 'The proposed changes were approved, pushed, and synced successfully.',
  };
}

export async function reconcileCourseAgentPushApproval({
  proposal,
  course,
  conversationId,
  sandboxId,
  runId,
  userId,
}: {
  proposal: WorkerApproval;
  course: Course;
  conversationId: string;
  sandboxId: string;
  runId: string;
  userId: string;
}) {
  let approval: CourseAgentPushApproval = await prepareCourseAgentApproval({
    proposal,
    course,
    conversationId,
    runId,
    userId,
  });
  if (approval.status === 'publishing' && typeof approval.result?.jobSequenceId === 'string') {
    const jobSequenceId = approval.result.jobSequenceId;
    const jobs = await selectJobsByJobSequenceId(jobSequenceId);
    const job = jobs.at(-1);
    if (job?.status === 'Running' && job.data.saveSucceeded === true) {
      await respondToCourseAgentPushApproval({
        userId,
        courseId: course.id,
        conversationId,
        sandboxId,
        approvalId: approval.id,
        decision: 'publishing',
        phase: 'syncing',
      });
    }
    if (job && job.status !== 'Running' && job.status !== 'Stopping') {
      const outcome = classifyEditOutcome(job.data);
      const status = outcome === 'success' ? 'completed' : 'failed';
      const result = {
        jobSequenceId,
        published: outcome !== 'save_failed',
        publicationUnknown: outcome === 'save_failed',
        message:
          outcome === 'success'
            ? 'The approved changes were published and synced.'
            : `Publication was interrupted or failed. Inspect the remote before proposing further changes; this operation will not push again.\n${courseAgentErrorMessage(new Error(job.output ?? job.error_message ?? 'No job output was recorded.'))}`,
      };
      approval =
        (await updateCourseAgentPushApproval({
          approvalId: approval.id,
          status,
          expectedStatuses: ['publishing'],
          decidedBy: approval.decided_by,
          result,
        })) ?? approval;
    }
  }
  if (
    approval.status === 'publishing' &&
    !approval.result?.jobSequenceId &&
    approval.decided_at &&
    Date.now() - approval.decided_at.getTime() > 300_000
  ) {
    approval =
      (await updateCourseAgentPushApproval({
        approvalId: approval.id,
        status: 'failed',
        expectedStatuses: ['publishing'],
        decidedBy: approval.decided_by,
        result: {
          published: false,
          message:
            'Publication stopped before its job was recorded. No push was started. Request publication again after inspecting the workspace.',
        },
      })) ?? approval;
  }
  if (
    approval.status === 'pending' ||
    approval.status === 'completed' ||
    approval.status === 'failed' ||
    approval.status === 'denied'
  ) {
    await respondToCourseAgentPushApproval({
      userId,
      courseId: course.id,
      conversationId,
      sandboxId,
      approvalId: approval.id,
      decision: approval.status,
      result: approval.result,
    });
  }
  return approval;
}
