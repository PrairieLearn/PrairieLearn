import { createHash, randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  CourseAgentSnapshotSchema,
  CourseAgentWorkspaceBackupSchema,
  courseAgentSandboxId,
} from '@prairielearn/course-agent-protocol';

import {
  getEphemeralCourseAgentSnapshot,
  respondToCourseAgentPushApproval,
  startEphemeralCourseAgentRun,
} from '../../ee/lib/course-agent/ephemeral-runtime.js';
import { publishCourseAgentApproval } from '../../ee/lib/course-agent/publication.js';
import {
  assertCourseAgentWithinUsageLimits,
  recordCourseAgentRollingUsage,
} from '../../ee/lib/course-agent/usage-limits.js';
import {
  CourseAgentConversationSchema,
  CourseAgentEventRowSchema,
  CourseAgentMessageSchema,
} from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import {
  createCourseAgentTurn,
  persistCourseAgentSnapshot,
  selectCourseAgentConversationUsage,
  selectCourseAgentConversations,
  selectCourseAgentHistory,
  selectOptionalCourseAgentConversation,
  selectOptionalCourseAgentPushApproval,
  updateCourseAgentPushApproval,
  upsertCourseAgentPushApproval,
} from '../../models/course-agent.js';

import {
  requireAuthnCoursePermissionOwn,
  requireCoursePermissionOwn,
  requireNotExampleCourse,
  t,
} from './init.js';

export interface CourseAgentError {
  Get: never;
  List: never;
  Start: never;
  RespondToPushApproval: never;
}

const requireCourseAgentFeature = t.middleware(async (opts) => {
  if (!(await features.enabledFromLocals('course-agent', opts.ctx.locals))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Course agent is not enabled' });
  }
  return opts.next();
});

const courseAgentProcedure = t.procedure
  .use(requireCourseAgentFeature)
  .use(requireAuthnCoursePermissionOwn)
  .use(requireCoursePermissionOwn)
  .use(requireNotExampleCourse);

const start = courseAgentProcedure
  .input(
    z.object({ conversationId: z.uuid().optional(), prompt: z.string().trim().min(1).max(20_000) }),
  )
  .output(
    z.object({
      accepted: z.literal(true),
      conversationId: z.uuid(),
      runId: z.uuid(),
      sandboxId: z.string(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    if (!ctx.course.repository) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Configure a Git repository for this course before starting the course agent',
      });
    }
    await assertCourseAgentWithinUsageLimits({
      userId: ctx.locals.authn_user.id,
      courseId: ctx.course.id,
    });
    const conversationId = input.conversationId ?? randomUUID();
    const runId = randomUUID();
    const sandboxId = courseAgentSandboxId(conversationId);
    if (input.conversationId) {
      const existing = await selectOptionalCourseAgentConversation({
        conversationId,
        courseId: ctx.course.id,
        userId: ctx.locals.authn_user.id,
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course-agent conversation not found' });
      }
    }
    const history = input.conversationId
      ? await selectCourseAgentHistory(conversationId)
      : { backup: null };
    const parsedBackup = history.backup
      ? CourseAgentWorkspaceBackupSchema.safeParse({
          handle: history.backup.backup_handle,
          expiresAt: history.backup.expires_at?.toISOString(),
        })
      : null;
    await createCourseAgentTurn({
      conversation: {
        id: conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
        title: input.prompt.slice(0, 80),
        sandbox_id: sandboxId,
        runtime_status: 'starting',
      },
      runId,
      prompt: input.prompt,
      promptDigest: createHash('sha256').update(input.prompt).digest('hex'),
    });
    return startEphemeralCourseAgentRun({
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
      conversationId,
      runId,
      prompt: input.prompt,
      course: {
        repository: ctx.course.repository,
        branch: ctx.course.branch,
        expectedSha: ctx.course.commit_hash,
      },
      workspaceBackup: parsedBackup?.success ? parsedBackup.data : null,
    });
  });

const get = courseAgentProcedure
  .input(z.object({ conversationId: z.uuid(), sandboxId: z.string() }))
  .output(
    CourseAgentSnapshotSchema.extend({
      messages: z.array(CourseAgentMessageSchema),
      persistedEvents: z.array(CourseAgentEventRowSchema),
      conversationUsage: z.object({
        normalized_total_tokens: z.number(),
        estimated_cost_milli_dollars: z.number(),
      }),
    }),
  )
  .query(async ({ ctx, input }) => {
    const conversation = await selectOptionalCourseAgentConversation({
      conversationId: input.conversationId,
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
    });
    if (!conversation) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Course-agent conversation not found' });
    }
    const before = await selectCourseAgentHistory(conversation.id);
    let runId: string | null = null;
    for (const message of before.messages) {
      if (message.run_id) runId = message.run_id;
    }
    if (!runId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course-agent run not found' });
    const snapshot = await getEphemeralCourseAgentSnapshot({
      userId: ctx.locals.authn_user.id,
      courseId: ctx.course.id,
      ...input,
    });
    if (snapshot.pendingApproval) {
      if (!ctx.course.repository) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Course repository is missing',
        });
      }
      await upsertCourseAgentPushApproval({
        approval: snapshot.pendingApproval,
        conversationId: conversation.id,
        runId,
        courseId: ctx.course.id,
        userId: ctx.locals.authn_user.id,
        repository: ctx.course.repository,
      });
    }
    const runUsage = await persistCourseAgentSnapshot({ snapshot, runId });
    await recordCourseAgentRollingUsage({
      userId: ctx.locals.authn_user.id,
      courseId: ctx.course.id,
      runId,
      cumulativeMilliDollars: Number(runUsage.estimated_cost_milli_dollars),
      occurredAtMilliseconds: snapshot.usage.finalizedAt
        ? new Date(snapshot.usage.finalizedAt).getTime()
        : Date.now(),
    });
    const [history, conversationUsage] = await Promise.all([
      selectCourseAgentHistory(conversation.id),
      selectCourseAgentConversationUsage(conversation.id),
    ]);
    return {
      ...snapshot,
      messages: history.messages,
      persistedEvents: history.events,
      conversationUsage,
    };
  });

const list = courseAgentProcedure
  .output(z.object({ conversations: z.array(CourseAgentConversationSchema) }))
  .query(async ({ ctx }) => ({
    conversations: await selectCourseAgentConversations(ctx.course.id, ctx.locals.authn_user.id),
  }));

const respondToPushApproval = courseAgentProcedure
  .input(
    z.object({
      approvalId: z.uuid(),
      decision: z.enum(['approve', 'deny']),
    }),
  )
  .output(z.object({ status: z.enum(['denied', 'completed', 'failed']), message: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const approval = await selectOptionalCourseAgentPushApproval({
      approvalId: input.approvalId,
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
    });
    if (!approval) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Push approval not found' });
    }
    const identity = {
      userId: ctx.locals.authn_user.id,
      courseId: ctx.course.id,
      conversationId: approval.conversation_id,
      sandboxId: courseAgentSandboxId(approval.conversation_id),
    };
    if (input.decision === 'deny') {
      const denied = await updateCourseAgentPushApproval({
        approvalId: approval.id,
        status: 'denied',
        expectedStatuses: ['pending'],
        decidedBy: ctx.locals.authn_user.id,
        result: { message: 'The instructor denied publication' },
      });
      if (!denied) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Approval is no longer pending' });
      }
      await respondToCourseAgentPushApproval({
        ...identity,
        approvalId: approval.id,
        decision: 'denied',
        result: denied.result,
      });
      return { status: 'denied', message: 'Publication denied' };
    }

    const publishing = await updateCourseAgentPushApproval({
      approvalId: approval.id,
      status: 'publishing',
      expectedStatuses: ['pending'],
      decidedBy: ctx.locals.authn_user.id,
      result: null,
    });
    if (!publishing) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Approval is no longer pending' });
    }
    await respondToCourseAgentPushApproval({
      ...identity,
      approvalId: approval.id,
      decision: 'publishing',
    });
    try {
      const result = await publishCourseAgentApproval({
        approval: publishing,
        course: ctx.locals.course,
        user: ctx.locals.user,
        authzData: ctx.locals.authz_data,
      });
      await updateCourseAgentPushApproval({
        approvalId: approval.id,
        status: 'completed',
        expectedStatuses: ['publishing'],
        decidedBy: ctx.locals.authn_user.id,
        result,
      });
      await respondToCourseAgentPushApproval({
        ...identity,
        approvalId: approval.id,
        decision: 'completed',
        result,
      });
      return { status: 'completed', message: 'Changes pushed and course sync started' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = { message };
      await updateCourseAgentPushApproval({
        approvalId: approval.id,
        status: 'failed',
        expectedStatuses: ['publishing'],
        decidedBy: ctx.locals.authn_user.id,
        result,
      });
      await respondToCourseAgentPushApproval({
        ...identity,
        approvalId: approval.id,
        decision: 'failed',
        result,
      });
      return { status: 'failed', message };
    }
  });

export const courseAgentRouter = t.router({ get, list, respondToPushApproval, start });
