import { createHash } from 'node:crypto';

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
import { type Course, type CourseAgentConversation } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';
import { isEnterprise } from '../../../lib/license.js';
import { type AgentScope } from '../../../models/course-agent-conversation.js';
import * as proposals from '../../../models/course-agent-proposal.js';
import { selectCourseById } from '../../../models/course.js';

import { hasCourseAgentOwnerAccess } from './access.js';
import { workerResponseError } from './errors.js';
import { notify } from './events.js';
import { createCloudflareProvider } from './provider.js';
import { type Publication, PublishRejected, Publisher } from './publish.js';
import { admitResult, recordUsage } from './usage.js';

function integration() {
  if (!config.courseAgent || !isEnterprise()) {
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
    (newWork &&
      !(await features.enabled('course-agent', {
        course_id: course.id,
        institution_id: course.institution_id,
        user_id: scope.user_id,
      })))
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

async function authorizedDestination(scope: AgentScope, conversation: CourseAgentConversation) {
  const course = await authorize(scope);
  const target = destination(course);
  if (target.repository !== conversation.repository || target.branch !== conversation.branch) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'Course repository changed. Start a new conversation; existing cleanup remains available.',
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
      try {
        const pending = job(conversation, row);
        await publisher(conversation).prepare(pending);
        await proposals.prepareProposal(row.id, pending.approval, true, null);
      } catch (error) {
        await proposals.prepareProposal(
          row.id,
          row.payload,
          false,
          error instanceof PublishRejected
            ? error.message
            : 'Proposal validation failed. Retry preparation after checking repository access.',
        );
      }
    },
  );
  await notify(conversation.id);
}
export async function snapshot(conversation: CourseAgentConversation, value: ChatSnapshot) {
  const rows = await proposals.selectProposals(conversation.id);
  const current = rows.find((r) => !r.delivered) ?? rows.at(-1);
  const approvals = rows.map((r) => ({
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
    revision: conversation.revision,
    approvals,
    approval: approvals.find((a) => a.id === current?.operation_id),
    publication: current
      ? {
          repository: conversation.repository,
          branch: conversation.branch,
          publishedSha: current.published_sha ?? undefined,
          syncedSha: current.synced_sha ?? undefined,
          syncJobSequenceId: current.sync_job_sequence_id ?? undefined,
          status:
            current.error || !current.prepared
              ? ('invalid' as const)
              : current.decision === null
                ? ('ready' as const)
                : ('publishing' as const),
          error: current.error ?? undefined,
          decision: current.decision ?? undefined,
        }
      : undefined,
  };
}
export async function complete(
  scope: AgentScope,
  conversation: CourseAgentConversation,
  input: ApprovalDecision,
) {
  await namedLocks.doWithLock(
    `course-agent:proposal:${input.id}`,
    { timeout: 1, autoRenew: true },
    async () => {
      await authorizedDestination(scope, conversation);
      let row = await proposals.selectOptionalProposal(conversation.id, input.id);
      if (row?.digest !== input.digest) {
        throw new TRPCError({ code: 'CONFLICT', message: 'The reviewed proposal changed.' });
      }
      if (input.approved && !row.prepared) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Retry preparation before approving.' });
      }
      await proposals.decideProposal(
        scope,
        conversation,
        row,
        input.approved,
        input.expectedRevision,
      );
      row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
      try {
        if (!row.outcome) {
          if (!input.approved) {
            await proposals.saveProposalProgress(row.id, {
              outcome: 'The user denied this proposal. Nothing was published.',
            });
          } else {
            let sha = row.published_sha;
            if (!sha) {
              await authorizedDestination(scope, conversation);
              sha = await publisher(conversation).push(job(conversation, row));
              await proposals.saveProposalProgress(row.id, { published_sha: sha });
            }
            let synced = false;
            if (row.sync_job_sequence_id) {
              const { status } = await proposals.selectSyncStatus(row.sync_job_sequence_id);
              if (status === 'Running') {
                throw new Error(
                  'Course Sync is still running. Retry completion after it finishes.',
                );
              }
              synced = status === 'Success' && !!row.synced_sha;
            }
            if (!synced) {
              const sync = await pullAndUpdateCourse({
                course: await authorizedDestination(scope, conversation),
                userId: scope.user_id,
                authnUserId: scope.authn_user_id,
                expectedAncestorSha: sha,
                onJobCreated: async (id) => {
                  await proposals.saveProposalProgress(row!.id, { sync_job_sequence_id: id });
                },
                onSynced: async (commit) => {
                  await proposals.saveProposalProgress(row!.id, { synced_sha: commit });
                },
              });
              await sync.jobPromise;
              const { status } = await proposals.selectSyncStatus(sync.jobSequenceId);
              if (status !== 'Success') {
                throw new Error(
                  'Publication succeeded, but Course Sync failed. Review the Course Sync log and correct any reported course errors before retrying completion. Retrying only runs sync; it does not republish.',
                );
              }
            }
            row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
            if (!row.synced_sha) {
              throw new Error('Course Sync did not confirm the approved commit. Retry completion.');
            }
            await proposals.saveProposalProgress(row.id, {
              outcome: `Published ${sha} to ${conversation.repository} (${conversation.branch}). Course Sync completed at ${row.synced_sha}. Fetch and reconcile your checkout with the remote, preserving divergent work, before further edits.`,
            });
          }
        }
        row = (await proposals.selectOptionalProposal(conversation.id, input.id))!;
        if (!row.delivered && row.outcome) {
          const chat = await provider(scope, conversation, true);
          const state = await chat.getSnapshot(AbortSignal.timeout(10000));
          await recordUsage(conversation, state);
          await admitResult(conversation, input.id, state);
          const { observe } = await import('./observer.js');
          await observe(conversation, chat, (tool) => prepare(scope, conversation, tool));
          await chat.deliverToolResult(
            {
              id: input.id,
              result: row.outcome,
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
          await proposals.saveProposalProgress(row.id, { delivered: true });
        }
      } catch (error) {
        if (error instanceof PublishRejected) {
          await proposals.saveProposalProgress(row.id, {
            outcome: `Publication rejected: ${error.message} Prepare a new proposal.`,
            error: error.message,
          });
        } else {
          await proposals.saveProposalProgress(row.id, {
            error: error instanceof Error ? error.message : 'Completion failed.',
          });
        }
        throw error;
      } finally {
        await notify(conversation.id);
      }
    },
  );
}
