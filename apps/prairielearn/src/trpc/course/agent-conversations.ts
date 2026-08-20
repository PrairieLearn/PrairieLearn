import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  type AgentRepository,
  type AgentRunCapabilityClaims,
  AgentToolNameSchema,
  PublishAgentRunRequestSchema,
  PublishAgentRunResponseSchema,
  StartAgentRunRequestSchema,
} from '@prairielearn/agent-protocol';
import { IdSchema } from '@prairielearn/zod';

import {
  signAgentPublicationCapability,
  signAgentRunCapability,
} from '../../lib/agent-capability.js';
import { config } from '../../lib/config.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import type { AgentConversation } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { parseGithubRepository } from '../../lib/github-utils.js';
import { createDraftPullRequest } from '../../lib/github.js';
import { idsEqual } from '../../lib/id.js';
import {
  appendAgentRunEvents,
  beginAgentOperation,
  completeAgentOperation,
  createAgentConversation,
  createAgentRun,
  failAgentOperation,
  listAgentEvents,
  requestAgentRunStop,
  retryAgentOperation,
  selectActiveAgentRun,
  selectAgentArtifacts,
  selectAgentConversation,
  selectAgentConversations,
  selectAgentDraftQuestionIds,
  selectAgentOperationResultEvent,
  selectAgentRuns,
  selectLatestAgentCheckpoint,
  selectLatestAgentRun,
  tombstoneAgentConversation,
} from '../../models/agent-conversation.js';

import {
  type TRPCContext,
  requireCoursePermissionEdit,
  requireNotExampleCourse,
  t,
} from './init.js';

export interface AgentConversationsError {
  Create: never;
  Delete: never;
  Get: never;
  List: never;
  ListEvents: never;
  Publish: never;
  StartTurn: never;
  Stop: never;
}

const requireCloudAgent = t.middleware(async ({ ctx, next }) => {
  const enabled = await features.enabled('cloud-agent', {
    course_id: ctx.course.id,
    institution_id: ctx.course.institution_id,
    user_id: ctx.authz_data.authn_user.id,
  });
  if (!enabled) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Course agent is not enabled.' });
  }
  if (!idsEqual(ctx.authz_data.authn_user.id, ctx.authz_data.user.id)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Course agent cannot be used while acting as another user.',
    });
  }
  return await next();
});

const protectedProcedure = t.procedure
  .use(requireCloudAgent)
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse);

const ConversationInputSchema = z.object({ conversationId: IdSchema });

function notFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
}

async function getConversation(ctx: TRPCContext, conversationId: string) {
  const conversation = await selectAgentConversation({
    authnUserId: ctx.authz_data.authn_user.id,
    conversationId,
    courseId: ctx.course.id,
  });
  return conversation ?? notFound();
}

function publicRun<T extends { capability_jti: string }>({
  capability_jti: _capabilityJti,
  ...run
}: T) {
  return run;
}

function getRepository(ctx: TRPCContext): AgentRepository | undefined {
  if (ctx.course.repository === null || ctx.course.commit_hash === null) return undefined;
  const parsed = parseGithubRepository(ctx.course.repository);
  if (parsed === null || !/^[0-9a-f]{40}$/.test(ctx.course.commit_hash)) return undefined;
  return {
    base_sha: ctx.course.commit_hash,
    branch: ctx.course.branch,
    https_url: `https://github.com/${parsed.owner}/${parsed.repo}.git`,
  };
}

function getConversationRepository(
  ctx: TRPCContext,
  conversation: AgentConversation,
): AgentRepository | undefined {
  if (
    conversation.repository_url === null ||
    conversation.repository_branch === null ||
    conversation.repository_base_sha === null
  ) {
    return undefined;
  }
  const current =
    ctx.course.repository === null ? null : parseGithubRepository(ctx.course.repository);
  const currentUrl =
    current === null ? null : `https://github.com/${current.owner}/${current.repo}.git`;
  if (currentUrl !== conversation.repository_url) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'The course repository changed after this conversation was created.',
    });
  }
  return {
    base_sha: conversation.repository_base_sha,
    branch: conversation.repository_branch,
    https_url: conversation.repository_url,
  };
}

function makeRunClaims({
  ctx,
  runId,
  conversationId,
  jti,
  expiresAt,
  allowedTools,
  baseUrl,
  repository,
  purpose,
  prompt,
}: {
  ctx: TRPCContext;
  runId: string;
  conversationId: string;
  jti: string;
  expiresAt: Date;
  allowedTools: z.infer<typeof AgentToolNameSchema>[];
  baseUrl: string;
  repository: AgentRepository | undefined;
  purpose: AgentRunCapabilityClaims['purpose'];
  prompt: string;
}): AgentRunCapabilityClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    allowed_tools: allowedTools,
    aud:
      purpose === 'run'
        ? ['prairielearn-agent-worker', 'prairielearn-agent-api']
        : 'prairielearn-agent-worker',
    authn_user_id: ctx.authz_data.authn_user.id,
    conversation_id: conversationId,
    course_id: ctx.course.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
    harness: config.agentHarness,
    iat: now,
    iss: 'prairielearn',
    jti,
    prairielearn_base_url: baseUrl,
    prompt_sha256: createHash('sha256').update(prompt).digest('hex'),
    purpose,
    repository,
    run_id: runId,
    sub: ctx.authz_data.authn_user.id,
    user_id: ctx.authz_data.user.id,
  };
}

async function callWorker(path: string, token: string, init: RequestInit = {}) {
  if (config.agentWorkerUrl === null) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Course agent is not configured.',
    });
  }
  const response = await fetch(new URL(path, config.agentWorkerUrl), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: `Course agent worker returned ${response.status}.`,
    });
  }
  return response;
}

const create = protectedProcedure.input(z.object({})).mutation(async ({ ctx }) => {
  const conversation = await createAgentConversation({
    authnUserId: ctx.authz_data.authn_user.id,
    courseId: ctx.course.id,
    repository: getRepository(ctx),
    title: null,
    userId: ctx.authz_data.user.id,
  });
  return { conversation };
});

const list = protectedProcedure.query(async ({ ctx }) => ({
  conversations: await selectAgentConversations({
    authnUserId: ctx.authz_data.authn_user.id,
    courseId: ctx.course.id,
  }),
}));

const get = protectedProcedure.input(ConversationInputSchema).query(async ({ ctx, input }) => {
  const conversation = await getConversation(ctx, input.conversationId);
  const [runs, artifacts] = await Promise.all([
    selectAgentRuns({ conversationId: conversation.id, courseId: ctx.course.id }),
    selectAgentArtifacts(conversation.id),
  ]);
  const checkpoint = runs.length === 0 ? null : await selectLatestAgentCheckpoint(runs.at(-1)!.id);
  return {
    artifacts: artifacts.map(({ storage_key: _storageKey, ...artifact }) => artifact),
    conversation,
    checkpoint,
    runs: runs.map(publicRun),
  };
});

const listEvents = protectedProcedure
  .input(
    ConversationInputSchema.extend({ afterSequence: z.number().int().nonnegative().optional() }),
  )
  .query(async ({ ctx, input }) => {
    const conversation = await getConversation(ctx, input.conversationId);
    const rows = await listAgentEvents({
      afterSequence: input.afterSequence ?? 0,
      conversationId: conversation.id,
    });
    const hasMore = rows.length > 200;
    const events = rows.slice(0, 200);
    return {
      events,
      hasMore,
      nextSequence: events.at(-1)?.sequence ?? input.afterSequence ?? 0,
    };
  });

const startTurn = protectedProcedure
  .input(
    ConversationInputSchema.extend({
      message: z.string().trim().min(1).max(100_000),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    if (config.agentCapabilitySecret === null || config.agentWorkerUrl === null) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Course agent is not configured.',
      });
    }
    const conversation = await getConversation(ctx, input.conversationId);
    if ((await selectActiveAgentRun(conversation.id)) !== null) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This conversation already has an active run.',
      });
    }
    const repository = getConversationRepository(ctx, conversation);
    if (config.agentHarness === 'claude' && repository === undefined) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Claude runs require a GitHub repository and synced commit.',
      });
    }
    const baseUrl = config.serverCanonicalHost ?? ctx.requestOrigin;
    const arbitrarySqlEnabled =
      config.devMode &&
      (await features.enabled('cloud-agent-arbitrary-sql', {
        course_id: ctx.course.id,
        institution_id: ctx.course.institution_id,
        user_id: ctx.authz_data.authn_user.id,
      }));
    const allowedTools = AgentToolNameSchema.options.filter(
      (tool) => tool !== 'query_course_data' || arbitrarySqlEnabled,
    );
    const expiresAt = new Date(Date.now() + config.agentCapabilityTtlSeconds * 1000);
    const jti = randomUUID();
    const run = await createAgentRun({
      allowedTools,
      authnUserId: ctx.authz_data.authn_user.id,
      baseCommitSha: repository?.base_sha ?? null,
      capabilityExpiresAt: expiresAt,
      capabilityJti: jti,
      conversation,
      message: input.message,
      userId: ctx.authz_data.user.id,
    });
    const claims = makeRunClaims({
      allowedTools,
      baseUrl,
      conversationId: conversation.id,
      ctx,
      expiresAt,
      jti,
      prompt: input.message,
      purpose: 'run',
      repository,
      runId: run.id,
    });
    const token = await signAgentRunCapability(claims);
    const body = StartAgentRunRequestSchema.parse({
      conversation_id: conversation.id,
      course_id: ctx.course.id,
      harness: config.agentHarness,
      prairielearn_base_url: baseUrl,
      prompt: input.message,
      repository,
      run_id: run.id,
    });
    try {
      await callWorker('/v1/runs/start', token, { body: JSON.stringify(body), method: 'POST' });
    } catch (error) {
      await appendAgentRunEvents({
        claudeSessionId: null,
        courseId: ctx.course.id,
        error: error instanceof Error ? error.message : 'Worker did not accept the run.',
        events: [
          {
            data: { error: 'Worker did not accept the run.' },
            event_id: `run-failed:prairielearn:${run.id}`,
            type: 'run_failed',
          },
        ],
        run,
        terminalStatus: 'failed',
      });
      throw error;
    }
    return { run: publicRun(run) };
  });

const stop = protectedProcedure.input(ConversationInputSchema).mutation(async ({ ctx, input }) => {
  const conversation = await getConversation(ctx, input.conversationId);
  const run = await selectActiveAgentRun(conversation.id);
  if (run === null) return { run: null };
  const repository = getConversationRepository(ctx, conversation);
  const claims = makeRunClaims({
    allowedTools: AgentToolNameSchema.array().parse(run.allowed_tools),
    baseUrl: config.serverCanonicalHost ?? ctx.requestOrigin,
    conversationId: conversation.id,
    ctx,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    jti: randomUUID(),
    prompt: run.message,
    purpose: 'control',
    repository,
    runId: run.id,
  });
  const token = await signAgentRunCapability(claims);
  const stoppingRun = await requestAgentRunStop({ courseId: ctx.course.id, run });
  await callWorker(`/v1/runs/${run.id}/cancel`, token, { method: 'POST' });
  return { run: publicRun(stoppingRun) };
});

const deleteConversation = protectedProcedure
  .input(ConversationInputSchema)
  .mutation(async ({ ctx, input }) => {
    const conversation = await getConversation(ctx, input.conversationId);
    const run = await selectLatestAgentRun({
      conversationId: conversation.id,
      courseId: ctx.course.id,
    });
    if (run !== null) {
      const deleteExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const token = await signAgentRunCapability(
        makeRunClaims({
          allowedTools: AgentToolNameSchema.array().parse(run.allowed_tools),
          baseUrl: config.serverCanonicalHost ?? ctx.requestOrigin,
          conversationId: conversation.id,
          ctx,
          expiresAt: deleteExpiresAt,
          jti: randomUUID(),
          prompt: run.message,
          purpose: 'delete',
          repository: getConversationRepository(ctx, conversation),
          runId: run.id,
        }),
      );
      await callWorker(`/v1/conversations/${conversation.id}`, token, { method: 'DELETE' });
    }
    const draftQuestionIds = await selectAgentDraftQuestionIds(conversation.id);
    if (draftQuestionIds.length > 0) {
      const result = await getCourseFilesClient().batchDeleteQuestions.mutate({
        authn_user_id: ctx.authz_data.authn_user.id,
        course_id: ctx.course.id,
        has_course_permission_edit: true,
        question_ids: draftQuestionIds,
        user_id: ctx.authz_data.user.id,
      });
      if (result.status === 'error') {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete agent draft questions (${result.job_sequence_id}).`,
        });
      }
    }
    await tombstoneAgentConversation({ conversation });
    return { deleted: true };
  });

const CheckpointSchema = z.looseObject({ head_sha: z.string().regex(/^[0-9a-f]{40}$/) });

const publish = protectedProcedure
  .input(ConversationInputSchema)
  .mutation(async ({ ctx, input }) => {
    const conversation = await getConversation(ctx, input.conversationId);
    const run = await selectLatestAgentRun({
      conversationId: conversation.id,
      courseId: ctx.course.id,
    });
    if (run?.status !== 'completed') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'A completed run is required.' });
    }
    const checkpoint = await selectLatestAgentCheckpoint(run.id);
    if (checkpoint === null) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No publishable checkpoint exists.',
      });
    }
    const { head_sha: headSha } = CheckpointSchema.parse(checkpoint.data);
    const repository = getConversationRepository(ctx, conversation);
    const localFixturePublish = config.devMode && repository === undefined;
    const localOnlyPublish = config.devMode && config.agentWorkerUrl === null;
    if (repository === undefined && !localFixturePublish) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Course repository is unavailable.',
      });
    }
    const operationId = `publish:${run.id}:${headSha}`;
    const branch = `pl-agent/${conversation.id}-${headSha.slice(0, 12)}`;
    const target = {
      branch,
      head_sha: headSha,
      https_url: repository?.https_url ?? 'https://local.invalid/prairielearn/agent-fixture.git',
    };
    const request = PublishAgentRunRequestSchema.parse({ operation_id: operationId, target });
    const begun = await beginAgentOperation({
      courseId: ctx.course.id,
      expectedRevision: headSha,
      operationId,
      request,
      run,
      toolName: 'publish',
    });
    let operation = begun.operation;
    if (!begun.created) {
      if (
        operation.run_id !== run.id ||
        operation.tool_name !== 'publish' ||
        operation.expected_revision !== headSha ||
        !isDeepStrictEqual(operation.request, request)
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Publication operation ID was already used for another request.',
        });
      }
      const event = await selectAgentOperationResultEvent(operationId);
      if (operation.status === 'completed' && operation.response !== null && event !== null) {
        return { event, operation, published: operation.response };
      }
      if (operation.status !== 'failed') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Publication is already in progress.' });
      }
      operation = await retryAgentOperation({ courseId: ctx.course.id, operation, run });
    }
    if (localOnlyPublish) {
      const result = {
        branch,
        head_sha: headSha,
        local: true,
        operation_id: operationId,
        receipt: `local-publish:${operationId}`,
        repository: target.https_url,
      };
      const completed = await completeAgentOperation({
        commitSha: headSha,
        courseId: ctx.course.id,
        operation,
        result,
        run,
      });
      return { ...completed, published: result };
    }
    const runClaims = makeRunClaims({
      allowedTools: AgentToolNameSchema.array().parse(run.allowed_tools),
      baseUrl: config.serverCanonicalHost ?? ctx.requestOrigin,
      conversationId: conversation.id,
      ctx,
      expiresAt: new Date(Date.now() + Math.min(config.agentCapabilityTtlSeconds, 300) * 1000),
      jti: randomUUID(),
      prompt: run.message,
      purpose: 'publish',
      repository,
      runId: run.id,
    });
    const token = await signAgentPublicationCapability({
      ...runClaims,
      operation_id: operationId,
      purpose: 'publish',
      target,
    });
    try {
      const response = await callWorker(`/v1/runs/${run.id}/publish`, token, {
        body: JSON.stringify(request),
        method: 'POST',
      });
      const pushed = PublishAgentRunResponseSchema.parse(await response.json());
      if (pushed.head_sha !== headSha || pushed.branch !== branch) {
        throw new TRPCError({
          code: 'BAD_GATEWAY',
          message: 'Worker returned a mismatched publication.',
        });
      }
      if (localFixturePublish) {
        const result = {
          ...pushed,
          local: true,
          receipt: `local-worker-publish:${operationId}`,
          repository: target.https_url,
        };
        const completed = await completeAgentOperation({
          commitSha: pushed.head_sha,
          courseId: ctx.course.id,
          operation,
          result,
          run,
        });
        return { ...completed, published: result };
      }
      if (repository === undefined) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Course repository is unavailable.',
        });
      }
      const parsedRepository = parseGithubRepository(repository.https_url);
      if (parsedRepository === null) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'GitHub repository is invalid.',
        });
      }
      const pullRequest = await createDraftPullRequest({
        base: repository.branch,
        body: 'Draft changes created by the PrairieLearn course agent.',
        expectedHeadSha: pushed.head_sha,
        head: pushed.branch,
        owner: parsedRepository.owner,
        repo: parsedRepository.repo,
        title: 'Course agent changes',
      });
      const result = { ...pushed, pull_request: pullRequest };
      const completed = await completeAgentOperation({
        commitSha: pushed.head_sha,
        courseId: ctx.course.id,
        operation,
        result,
        run,
      });
      return { ...completed, published: result };
    } catch (publishError) {
      await failAgentOperation({
        courseId: ctx.course.id,
        error: publishError instanceof Error ? publishError.message : 'Publication failed.',
        operation,
        run,
      });
      throw publishError;
    }
  });

export const agentConversationsRouter = t.router({
  create,
  delete: deleteConversation,
  get,
  list,
  listEvents,
  publish,
  startTurn,
  stop,
});
