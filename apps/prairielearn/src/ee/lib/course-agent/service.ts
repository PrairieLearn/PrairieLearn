import { createHash } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  type ApprovalDecision,
  type ChatSnapshot,
  type PendingTool,
  approvalDisplaySchema,
  approvalSchema,
} from '@prairielearn/course-agent-contract';
import * as namedLocks from '@prairielearn/named-locks';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../../lib/config.js';
import { pullAndUpdateCourse } from '../../../lib/course.js';
import {
  type Course,
  type CourseAgentConversation,
  type CourseAgentProposal,
} from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import { isEnterprise } from '../../../lib/license.js';
import { selectJobSequenceStatus, selectJobsByJobSequenceId } from '../../../lib/server-jobs.js';
import {
  type AgentScope,
  selectConversationOperations,
} from '../../../models/course-agent-conversation.js';
import * as proposals from '../../../models/course-agent-proposal.js';
import { selectCourseById } from '../../../models/course.js';

import { hasCourseAgentOwnerAccess } from './access.js';
import { workerResponseError } from './errors.js';
import { notify } from './events.js';
import { createCloudflareProvider } from './provider.js';
import { type Publication, PublishRejected, Publisher } from './publish.js';
import { admitResult, modelPricing, recordUsage } from './usage.js';

/** A missing connection token keeps the launcher visible without exposing credentials. */
export function unavailableReason(): string | null {
  return config.courseAgent?.serviceToken
    ? null
    : 'Course agent is unavailable because its connection token is not configured. Contact your administrator.';
}

function integration() {
  if (!config.courseAgent?.serviceToken || !isEnterprise()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Course agent is not configured.',
    });
  }
  return config.courseAgent;
}
export function destination(course: Pick<Course, 'repository' | 'branch'>) {
  const repo = parseGithubRepository(course.repository ?? '');
  if (!repo || !course.branch) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Configure a GitHub repository and branch for this course.',
    });
  }
  return { repository: `${repo.owner}/${repo.repo}`, branch: course.branch };
}
export async function authorize(scope: AgentScope, newWork = false) {
  integration();
  const course = await selectCourseById(scope.course_id);
  if (
    course.deleted_at ||
    course.example_course ||
    (newWork && !(await newWorkEnabled(scope, course)))
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Course agent is unavailable for this course.',
    });
  }
  if (!(await hasCourseAgentOwnerAccess(scope))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Course owner access is required.' });
  }
  return course;
}
export function newWorkEnabled(scope: AgentScope, course: Pick<Course, 'id' | 'institution_id'>) {
  return features.enabled('course-agent', {
    course_id: course.id,
    institution_id: course.institution_id,
    user_id: scope.authn_user_id,
  });
}

async function authorizedDestination(scope: AgentScope, conversation: CourseAgentConversation) {
  const course = await authorize(scope);
  const target = destination(course);
  if (target.repository !== conversation.repository || target.branch !== conversation.branch) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'The course repository or branch changed. Start a new conversation.',
    });
  }
  return course;
}
export async function provider(
  scope: AgentScope,
  conversation: CourseAgentConversation,
  execute = false,
) {
  const settings = integration();
  if (execute) {
    const course = await authorizedDestination(scope, conversation);
    const response = await fetch(
      new URL(`/agents/chat/${conversation.external_id}/configure`, settings.workerUrl),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.serviceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(destination(course)),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      if (response.status === 409) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'This conversation is bound to another repository or branch. Start a new conversation.',
        });
      }
      throw workerResponseError(response.status);
    }
    const model = z.object({ model: z.string().min(1) }).parse(await response.json());
    if (!modelPricing(model.model)) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Configure course agent pricing for ${model.model} before starting work.`,
      });
    }
  } else {
    await authorize(scope);
  }
  return createCloudflareProvider(new URL(settings.workerUrl), conversation.external_id);
}

function publisher(conversation: CourseAgentConversation) {
  integration();
  const token = config.githubClientToken;
  if (!token) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'GitHub integration is not configured on this server.',
    });
  }
  return new Publisher(conversation, { token });
}

function job(
  conversation: CourseAgentConversation,
  row: Awaited<ReturnType<typeof proposals.selectProposals>>[number],
): Publication {
  return {
    id: row.operation_id,
    sequence: row.sequence,
    destination: { repository: conversation.repository, branch: conversation.branch },
    approval: approvalSchema.parse(row.payload),
    candidate: row.prepared ? row.digest : undefined,
    createdAt: row.created_at.toISOString(),
  };
}
export async function prepare(
  scope: AgentScope,
  conversation: CourseAgentConversation,
  tool: PendingTool,
) {
  await authorize(scope);
  if (tool.name !== 'push_sync') throw new Error('Unknown durable tool.');
  await namedLocks.doWithLock(
    `course-agent:proposal:${tool.id}`,
    { timeout: 5000, autoRenew: true },
    async () => {
      let row = await proposals.selectOptionalProposal(conversation.id, tool.id);
      const approval = approvalSchema.parse({ ...approvalSchema.parse(tool.args), id: tool.id });
      const identity = createHash('sha256')
        .update(JSON.stringify([conversation.repository, conversation.branch, approval.digest]))
        .digest('hex');
      if (!row) {
        row = await proposals.insertProposal({
          conversation_id: conversation.id,
          operation_id: tool.id,
          sequence: tool.sequence,
          payload: JSON.stringify(approval),
          digest: identity,
        });
      }
      if (row?.sequence !== tool.sequence || row.digest !== identity) {
        throw new Error('Proposal identity changed.');
      }
      if (row.prepared || row.decision !== null) return;
      if (!row.outcome) {
        try {
          const pending = job(conversation, row);
          await publisher(conversation).prepare(pending);
          await proposals.prepareProposal(row.id, pending.approval, true, null);
          return;
        } catch (error) {
          if (!(error instanceof PublishRejected)) {
            await proposals.saveProposalProgress(row.id, {
              error: 'Could not prepare the code change. Retry preparation.',
            });
            throw error;
          }
          await proposals.failProposalPreparation(row.id, error.message.slice(0, 1800));
          row = (await proposals.selectOptionalProposal(conversation.id, tool.id))!;
        }
      }
      if (!row.delivered && row.outcome) {
        const chat = await provider(scope, conversation);
        const state = await chat.getSnapshot(AbortSignal.timeout(10000));
        let dispatchId: string | undefined;
        if (state.pendingTool?.id === tool.id) {
          await recordUsage(conversation, state);
          if (!Object.values(state.executions ?? {}).some((value) => value.status === 'running')) {
            await provider(scope, conversation, true);
          }
          dispatchId = await admitResult(conversation, tool.id, state);
        }
        await chat.deliverToolResult(
          {
            id: tool.id,
            dispatchId,
            result: row.outcome,
            success: false,
            display: { name: 'push_sync', value: { error: row.error } },
          },
          AbortSignal.timeout(120000),
        );
        await proposals.saveProposalProgress(row.id, { delivered: true, error: row.error });
      }
    },
  );
  await notify(conversation.id);
}
export async function snapshot(conversation: CourseAgentConversation, value: ChatSnapshot) {
  const course = await selectCourseById(conversation.course_id);
  const currentRepository = parseGithubRepository(course.repository ?? '');
  const destinationChanged =
    !currentRepository ||
    `${currentRepository.owner}/${currentRepository.repo}` !== conversation.repository ||
    course.branch !== conversation.branch;
  const rows = await proposals.selectProposals(conversation.id);
  const operations = await selectConversationOperations(conversation.id);
  const prepared = rows.filter((row) => row.prepared);
  const current = prepared.find((r) => !r.delivered) ?? prepared.at(-1);
  const preparation = rows.find((row) => !row.prepared && !row.delivered);
  const syncStatus =
    current?.sync_job_sequence_id && !current.delivered
      ? (await selectJobSequenceStatus(current.sync_job_sequence_id)).status
      : undefined;
  let publicationStatus: NonNullable<ChatSnapshot['publication']>['status'] | undefined;
  if (current) {
    if (current.delivered) {
      publicationStatus = 'complete';
    } else if (current.decision === null) {
      publicationStatus = 'ready';
    } else if (syncStatus && ['Running', 'Stopping'].includes(syncStatus)) {
      publicationStatus = 'syncing';
    } else {
      // A saved outcome or finished sync can still be restoring the sandbox and delivering its result.
      // Probe the same database lock without waiting, including when another webserver owns it.
      const idle = await namedLocks.doWithLock(
        `course-agent:proposal:${current.operation_id}`,
        { timeout: 0, onNotAcquired: () => false },
        async () => true,
      );
      publicationStatus = idle ? 'retry' : 'publishing';
    }
  }
  const approvals = prepared.map((r) => ({
    ...approvalDisplaySchema.parse(r.payload),
    digest: r.digest,
    status:
      r.decision === null
        ? ('pending' as const)
        : r.decision
          ? ('approved' as const)
          : ('denied' as const),
    ...(r.outcome ? { result: r.outcome } : {}),
  }));
  return {
    ...value,
    newWorkUnavailable: destinationChanged
      ? 'The course repository or branch changed. Start a new conversation.'
      : undefined,
    messages: value.messages.map((message) => {
      const operation = operations.find((operation) => operation.operation_id === message.id);
      return operation
        ? {
            ...message,
            metadata: {
              ...(typeof message.metadata === 'object' ? message.metadata : {}),
              created_at: operation.created_at.toISOString(),
            },
          }
        : message;
    }),
    operationNumber: conversation.operation_number,
    approvals,
    preparation: preparation
      ? { id: preparation.operation_id, error: preparation.error ?? undefined }
      : value.pendingTool?.error
        ? { id: value.pendingTool.id, error: value.pendingTool.error }
        : undefined,
    approval: approvals.find((a) => a.id === current?.operation_id),
    publication: current
      ? {
          repository: conversation.repository,
          branch: conversation.branch,
          publishedSha: current.published_sha ?? undefined,
          syncedSha: current.synced_sha ?? undefined,
          syncJobSequenceId: current.sync_job_sequence_id ?? undefined,
          status: publicationStatus!,
          delivered: current.delivered,
          error: current.error ?? undefined,
          decision: current.decision ?? undefined,
        }
      : undefined,
  };
}

function continueAfterSync(
  sync: Awaited<ReturnType<typeof pullAndUpdateCourse>>,
  scope: AgentScope,
  conversation: CourseAgentConversation,
  input: ApprovalDecision,
) {
  // Release the proposal lock before waiting for Course Sync's own course-path lock.
  // The saved job receipt also lets a later request recover after a webserver restart.
  void sync.jobPromise
    .then(() => complete(scope, conversation, input, sync.jobSequenceId))
    .catch((error: unknown) => {
      Sentry.captureException(error);
    });
}

async function failSync(
  scope: AgentScope,
  conversation: CourseAgentConversation,
  row: CourseAgentProposal,
  input: ApprovalDecision,
): Promise<boolean> {
  if (row.sync_diagnostics === null) {
    const course = await authorizedDestination(scope, conversation);
    const jobs = row.sync_job_sequence_id
      ? await selectJobsByJobSequenceId(row.sync_job_sequence_id)
      : [];
    const details = stripVTControlCharacters(
      [
        course.sync_errors ? `infoCourse.json: ${course.sync_errors}` : null,
        ...jobs
          .filter((job) => job.status === 'Error')
          .map((job) => [job.error_message, job.output?.slice(-1000)].filter(Boolean).join('\n')),
      ]
        .filter(Boolean)
        .join('\n'),
    ).slice(0, 1200);
    await proposals.saveProposalProgress(row.id, {
      sync_diagnostics: details || 'Check the course sync log.',
    });
    row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
  }
  const recovery = `GitHub commit ${row.published_sha} was retained on ${conversation.repository} (${conversation.branch}). Course Sync may have applied valid course entities before failing. Fetch and reconcile the published commit, then correct the errors or explicitly revert the change in a new proposal for instructor approval.`;
  await proposals.saveProposalProgress(row.id, {
    outcome: `Course Sync failed. ${recovery}\nSync diagnostics:\n${row.sync_diagnostics}`,
    outcome_success: false,
    error: 'Course sync failed.',
  });
  return true;
}

export async function complete(
  scope: AgentScope,
  conversation: CourseAgentConversation,
  input: ApprovalDecision,
  finishedSync?: string,
) {
  await namedLocks.doWithLock(
    `course-agent:proposal:${input.id}`,
    { timeout: 5000, autoRenew: true },
    async () => {
      await authorizedDestination(scope, conversation);
      let row = await proposals.selectOptionalProposal(conversation.id, input.id);
      if (row?.digest !== input.digest) {
        throw new TRPCError({ code: 'CONFLICT', message: 'The reviewed proposal changed.' });
      }
      if (!row.prepared) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Retry preparation before approving.' });
      }
      await proposals.decideProposal(
        scope,
        conversation,
        row,
        input.decision,
        input.expectedOperationNumber,
      );
      row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
      try {
        try {
          if (!row.outcome) {
            if (input.decision === 'deny') {
              await proposals.saveProposalProgress(row.id, {
                outcome: 'The user denied this proposal. Nothing was published.',
                outcome_success: true,
              });
            } else {
              if (!row.published_sha) {
                await authorizedDestination(scope, conversation);
                const sha = await publisher(conversation).push(job(conversation, row));
                await proposals.saveProposalProgress(row.id, { published_sha: sha });
                row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
              }
              if (row.sync_job_sequence_id) {
                const { status } = await selectJobSequenceStatus(row.sync_job_sequence_id);
                if (status === 'Running' || status === 'Stopping') return;
              }
              if (row.sync_validation_failed) {
                if (!(await failSync(scope, conversation, row, input))) return;
              } else {
                if (row.sync_job_sequence_id) {
                  const { status } = await selectJobSequenceStatus(row.sync_job_sequence_id);
                  if (status === 'Running' || status === 'Stopping') return;
                  if (status !== 'Success') {
                    if (finishedSync === row.sync_job_sequence_id) {
                      throw new Error(
                        'Course Sync could not finish. The publication is saved; retry completion.',
                      );
                    }
                    await proposals.resetSyncReceipt(row.id);
                    row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
                  }
                }
                if (!row.synced_sha) {
                  const sync = await pullAndUpdateCourse({
                    course: await authorizedDestination(scope, conversation),
                    userId: scope.user_id,
                    authnUserId: scope.authn_user_id,
                    expectedAncestorSha: row.published_sha!,
                    onJobCreated: async (id) => {
                      await proposals.saveProposalProgress(row!.id, { sync_job_sequence_id: id });
                    },
                    onSynced: async (sha) => {
                      await proposals.saveProposalProgress(row!.id, { synced_sha: sha });
                    },
                    onAncestryFailure: async () => {
                      // Persist a terminal result before the failed job completes;
                      // continuation then delivers it instead of retrying sync.
                      await proposals.saveProposalProgress(row!.id, {
                        outcome: `GitHub publication was confirmed at ${row!.published_sha}, but Course Sync could not find it in the current remote history. Check repository access and branch history, reconcile the checkout, and request a new proposal for instructor approval. No automatic revert was made.`,
                        outcome_success: false,
                        error: 'The published commit is absent from the course sync history.',
                      });
                    },
                    onValidationFailure: async () => {
                      await proposals.saveProposalProgress(row!.id, {
                        sync_validation_failed: true,
                      });
                    },
                  });
                  continueAfterSync(sync, scope, conversation, input);
                  return;
                }
                await proposals.saveProposalProgress(row.id, {
                  outcome: `Published ${row.published_sha} to ${conversation.repository} (${conversation.branch}). Course Sync completed at ${row.synced_sha}. Fetch and reconcile your checkout with the remote, preserving divergent work, before further edits.`,
                  outcome_success: true,
                });
              }
            }
          }
        } catch (error) {
          if (!(error instanceof PublishRejected)) throw error;
          // A definite rejection is a tool result the agent can act on. Saving
          // it before delivery makes a failed/cold delivery retry independently.
          await proposals.saveProposalProgress(row.id, {
            outcome: `Publication rejected: ${error.message} Prepare a new proposal.`,
            outcome_success: false,
            error: error.message,
          });
        }
        row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
        if (!row.delivered && row.outcome) {
          const chat = await provider(scope, conversation, true);
          const state = await chat.getSnapshot(AbortSignal.timeout(10000));
          await recordUsage(conversation, state);
          const dispatchId = await admitResult(conversation, input.id, state);
          const { observe } = await import('./observer.js');
          await observe(conversation, chat, (tool) => prepare(scope, conversation, tool));
          await chat.deliverToolResult(
            {
              id: input.id,
              dispatchId,
              result: row.outcome,
              success: row.outcome_success!,
              display: {
                name: 'push_sync',
                value: {
                  ...approvalDisplaySchema.parse(row.payload),
                  digest: row.digest,
                  status: row.decision ? 'approved' : 'denied',
                  result: row.outcome,
                },
              },
            },
            AbortSignal.timeout(120000),
          );
          await proposals.saveProposalProgress(row.id, { delivered: true, error: row.error });
        }
      } catch (error) {
        await proposals.saveProposalProgress(row.id, {
          error: error instanceof Error ? error.message : 'Completion failed.',
        });
        throw error;
      } finally {
        await notify(conversation.id);
      }
    },
  );
}
