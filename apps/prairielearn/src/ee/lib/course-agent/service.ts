import { createHash } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';

import { TRPCError } from '@trpc/server';

import {
  type ApprovalDecision,
  type ChatSnapshot,
  type PendingTool,
  approvalDisplaySchema,
  approvalSchema,
} from '@prairielearn/course-agent-contract';
import * as namedLocks from '@prairielearn/named-locks';

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
import { type AgentScope } from '../../../models/course-agent-conversation.js';
import * as proposals from '../../../models/course-agent-proposal.js';
import { selectCourseById } from '../../../models/course.js';

import { hasCourseAgentOwnerAccess } from './access.js';
import { createAgentClient } from './provider.js';
import { type Publication, PublishRejected, Publisher } from './publish.js';
import { estimatedCost, modelPricing } from './usage.js';

/** Report missing configuration without exposing credentials to the browser. */
export function unavailableReason(): string | null {
  if (!config.courseAgent?.serviceToken) {
    return 'Course agent is unavailable because its connection token is not configured. Contact your administrator.';
  }
  if (!config.githubClientToken) {
    return 'Course agent is unavailable because its GitHub publishing token is not configured. Contact your administrator.';
  }
  return null;
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
  if (newWork) {
    const reason = unavailableReason();
    if (reason) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: reason });
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
  const chat = createAgentClient(
    new URL(settings.workerUrl),
    {
      conversationId: conversation.external_id,
      courseId: scope.course_id,
      userId: scope.user_id,
      authnUserId: scope.authn_user_id,
    },
    settings.serviceToken,
  );
  if (execute) {
    await authorizedDestination(scope, conversation);
    const { model } = await chat.configure(
      {
        repository: conversation.repository,
        branch: conversation.branch,
        modelPrices: config.costPerMillionTokens,
      },
      AbortSignal.timeout(10_000),
    );
    if (!modelPricing(model)) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Configure shared model pricing for ${model} before starting work.`,
      });
    }
  } else {
    await authorize(scope);
  }
  return chat;
}

function publisher(conversation: CourseAgentConversation) {
  integration();
  const token = config.githubClientToken;
  if (!token) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'GitHub publishing token is not configured on this server. Configure githubClientToken, then retry preparation.',
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
          payload: JSON.stringify(approval),
          digest: identity,
        });
      }
      if (row?.digest !== identity) {
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
              error:
                error instanceof TRPCError && error.code === 'PRECONDITION_FAILED'
                  ? error.message
                  : 'Could not prepare the code change. Retry preparation.',
            });
            throw error;
          }
          await proposals.failProposalPreparation(row.id, error.message.slice(0, 1800));
          row = (await proposals.selectOptionalProposal(conversation.id, tool.id))!;
        }
      }
    },
  );
}
export async function snapshot(conversation: CourseAgentConversation, value: ChatSnapshot) {
  const course = await selectCourseById(conversation.course_id);
  const currentRepository = parseGithubRepository(course.repository ?? '');
  const destinationChanged =
    !currentRepository ||
    `${currentRepository.owner}/${currentRepository.repo}` !== conversation.repository ||
    course.branch !== conversation.branch;
  const rows = await proposals.selectProposals(conversation.id);
  const prepared = rows.filter((row) => row.prepared);
  const current = prepared.find((r) => r.outcome === null) ?? prepared.at(-1);
  const preparation = rows.find((row) => !row.prepared && row.outcome === null);
  const syncStatus =
    current?.sync_job_sequence_id && current.outcome === null
      ? (await selectJobSequenceStatus(current.sync_job_sequence_id)).status
      : undefined;
  let publicationStatus: NonNullable<ChatSnapshot['publication']>['status'] | undefined;
  if (current) {
    if (current.outcome !== null) {
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
    usage: {
      input: value.conversationUsage?.input ?? null,
      output: value.conversationUsage?.output ?? null,
      estimatedCost: estimatedCost(
        value.conversationUsage,
        value.conversationUsage ? (modelPricing(value.conversationUsage.model) ?? null) : null,
      ),
    },
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
          complete: current.outcome !== null,
          error: current.error ?? undefined,
          decision: current.decision ?? undefined,
        }
      : undefined,
  };
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
) {
  await namedLocks.doWithLock(
    `course-agent:proposal:${input.id}`,
    { timeout: 5000, autoRenew: true },
    async () => {
      await authorize(scope);
      let row = await proposals.selectOptionalProposal(conversation.id, input.id);
      if (row?.digest !== input.digest) {
        throw new TRPCError({ code: 'CONFLICT', message: 'The reviewed proposal changed.' });
      }
      if (row.decision !== null && row.decision !== (input.decision === 'approve')) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Another decision is already saved.' });
      }
      if (row.outcome !== null) return;
      await authorizedDestination(scope, conversation);
      if (input.decision === 'approve' && row.decision === null) await authorize(scope, true);
      if (!row.prepared) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Retry preparation before approving.' });
      }
      await proposals.decideProposal(scope, conversation, row, input.decision);
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
                await authorize(scope, true);
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
                    await proposals.resetSyncReceipt(row.id);
                    row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
                  }
                }
                if (!row.synced_sha) {
                  await authorize(scope, true);
                  await pullAndUpdateCourse({
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
                  // Cloudflare advances from the saved sync receipt after this lock is released.
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
      } catch (error) {
        await proposals.saveProposalProgress(row.id, {
          error: error instanceof Error ? error.message : 'Completion failed.',
        });
        throw error;
      }
    },
  );
}
