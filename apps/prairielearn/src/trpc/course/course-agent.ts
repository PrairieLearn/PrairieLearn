import { createHash, randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  CourseAgentSnapshotSchema,
  CourseAgentWorkspaceBackupSchema,
  courseAgentSandboxId,
} from '@prairielearn/course-agent-protocol';
import { formatDateFriendly } from '@prairielearn/formatter';
import { logger } from '@prairielearn/logger';
import { IdSchema } from '@prairielearn/zod';

import { nameCourseAgentConversation } from '../../ee/lib/course-agent/conversation-title.js';
import {
  getEphemeralCourseAgentSnapshot,
  respondToCourseAgentPushApproval,
  startEphemeralCourseAgentRun,
} from '../../ee/lib/course-agent/ephemeral-runtime.js';
import { restoreCourseAgentMessages } from '../../ee/lib/course-agent/history.js';
import { publicCourseAgentEvent } from '../../ee/lib/course-agent/public-events.js';
import {
  CourseAgentPublicationError,
  courseAgentErrorMessage,
  prepareCourseAgentApproval,
  publishCourseAgentApproval,
} from '../../ee/lib/course-agent/publication.js';
import { config } from '../../lib/config.js';
import {
  CourseAgentConversationSchema,
  CourseAgentEventSchema,
  CourseAgentMessageSchema,
} from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import {
  createCourseAgentTurn,
  persistCourseAgentSnapshot,
  selectCourseAgentConversations,
  selectCourseAgentHistory,
  selectOptionalCourseAgentConversation,
  selectOptionalCourseAgentPushApproval,
  selectOptionalRunningCourseAgentRun,
  updateCourseAgentPushApproval,
} from '../../models/course-agent.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectUserSettings, updateCourseAgentApprovalMode } from '../../models/user-settings.js';

import {
  type TRPCContext,
  requireAuthnCoursePermissionOwn,
  requireCoursePermissionOwn,
  requireNotExampleCourse,
  t,
} from './init.js';

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
    z.object({
      conversationId: z.uuid().optional(),
      courseInstanceId: IdSchema.nullable(),
      prompt: z.string().trim().min(1).max(20_000),
    }),
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
    const courseInstance = input.courseInstanceId
      ? await selectOptionalCourseInstanceById(input.courseInstanceId)
      : null;
    if (
      input.courseInstanceId &&
      (!courseInstance ||
        courseInstance.deleted_at ||
        !idsEqual(courseInstance.course_id, ctx.course.id))
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The active course instance does not belong to this course',
      });
    }
    const authoringContext = {
      courseInstance: courseInstance
        ? {
            id: courseInstance.id,
            shortName: courseInstance.short_name,
            longName: courseInstance.long_name,
          }
        : null,
    };
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
      const snapshot = await getEphemeralCourseAgentSnapshot({
        userId: ctx.locals.authn_user.id,
        courseId: ctx.course.id,
        conversationId,
        sandboxId,
      });
      if (snapshot.activeRunId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A course-agent run is already active',
        });
      }
      const runningRun = await selectOptionalRunningCourseAgentRun(conversationId);
      if (runningRun) {
        await persistCourseAgentSnapshot({ snapshot, runId: runningRun.id });
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
        title: 'New conversation',
        sandbox_id: sandboxId,
        runtime_status: 'starting',
      },
      runId,
      prompt: input.prompt,
      promptDigest: createHash('sha256').update(input.prompt).digest('hex'),
    });
    // Only the request creating this conversation starts naming; subsequent messages do not retry it.
    if (!input.conversationId) {
      void nameCourseAgentConversation({
        conversationId,
        userId: ctx.locals.authn_user.id,
        courseId: ctx.course.id,
        prompt: input.prompt,
      }).catch(() => {
        logger.warn('Course-agent title generation failed; keeping New conversation', {
          conversationId,
        });
      });
    }
    try {
      const result = await startEphemeralCourseAgentRun({
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
        authoringContext,
        workspaceBackup: parsedBackup?.success ? parsedBackup.data : null,
      });
      if (config.courseAgentRuntime === 'fake') {
        const snapshot = await getEphemeralCourseAgentSnapshot({
          courseId: ctx.course.id,
          userId: ctx.locals.authn_user.id,
          conversationId,
          sandboxId,
        });
        await persistCourseAgentSnapshot({ snapshot, runId });
      }
      ctx.session.course_agent_conversation_id = conversationId;
      return result;
    } catch (error) {
      await persistCourseAgentSnapshot({
        runId,
        snapshot: {
          conversationId,
          sandboxId,
          activeRunId: null,
          status: 'failed',
          response: null,
          error: error instanceof Error ? error.message : String(error),
          events: [],
          workspaceBackup: null,
          pendingApproval: null,
        },
      });
      throw error;
    }
  });

const get = courseAgentProcedure
  .input(z.object({ conversationId: z.uuid(), sandboxId: z.string() }))
  .output(
    CourseAgentSnapshotSchema.extend({
      messages: z.array(CourseAgentMessageSchema),
      persistedEvents: z.array(CourseAgentEventSchema),
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
    let snapshot = await getEphemeralCourseAgentSnapshot({
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
      const approval = await prepareCourseAgentApproval({
        proposal: snapshot.pendingApproval,
        conversationId: conversation.id,
        runId,
        course: ctx.locals.course,
        userId: ctx.locals.authn_user.id,
      });
      if (
        approval.status === 'failed' ||
        approval.status === 'completed' ||
        approval.status === 'denied'
      ) {
        await respondToCourseAgentPushApproval({
          userId: ctx.locals.authn_user.id,
          courseId: ctx.course.id,
          conversationId: conversation.id,
          sandboxId: input.sandboxId,
          approvalId: approval.id,
          decision: approval.status,
          result: approval.result,
        });
        snapshot = { ...snapshot, pendingApproval: null };
      }
      const userSettings = await selectUserSettings({ user_id: ctx.locals.authn_user.id });
      if (userSettings.course_agent_approval_mode === 'always' && approval.status === 'pending') {
        await resolvePushApproval({ ctx, approvalId: approval.id, decision: 'approve' });
        snapshot = await getEphemeralCourseAgentSnapshot({
          userId: ctx.locals.authn_user.id,
          courseId: ctx.course.id,
          ...input,
        });
      }
    }
    await persistCourseAgentSnapshot({ snapshot, runId });
    const history = await selectCourseAgentHistory(conversation.id);
    return {
      ...snapshot,
      workspaceBackup: null,
      events: snapshot.events.flatMap((event) => publicCourseAgentEvent(event) ?? []),
      messages: history.messages,
      persistedEvents: [],
    };
  });

const list = courseAgentProcedure
  .output(
    z.object({
      conversations: z.array(
        CourseAgentConversationSchema.pick({
          id: true,
          title: true,
          runtime_status: true,
        }).extend({
          last_message_at: z.date(),
          lastMessageAtLabel: z.string(),
        }),
      ),
    }),
  )
  .query(async ({ ctx }) => ({
    conversations: (
      await selectCourseAgentConversations(ctx.course.id, ctx.locals.authn_user.id)
    ).map((conversation) => ({
      ...conversation,
      lastMessageAtLabel: formatDateFriendly(
        conversation.last_message_at,
        ctx.course.display_timezone,
        {
          maxPrecision: 'minute',
          minPrecision: 'minute',
        },
      ),
    })),
  }));

const diagnostics = courseAgentProcedure
  .use(
    t.middleware(async (opts) => {
      if (!opts.ctx.locals.is_administrator) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Administrator access required' });
      }
      return opts.next();
    }),
  )
  .input(z.object({ conversationId: z.uuid(), sandboxId: z.string() }))
  .output(CourseAgentSnapshotSchema)
  .query(({ ctx, input }) =>
    getEphemeralCourseAgentSnapshot({
      userId: ctx.locals.authn_user.id,
      courseId: ctx.course.id,
      ...input,
    }),
  );

const history = courseAgentProcedure
  .input(z.object({ conversationId: z.uuid().optional() }).optional())
  .query(async ({ ctx, input }) => {
    const selectedConversationId =
      input?.conversationId ?? ctx.session.course_agent_conversation_id;
    const selectedConversation = selectedConversationId
      ? await selectOptionalCourseAgentConversation({
          conversationId: selectedConversationId,
          courseId: ctx.course.id,
          userId: ctx.locals.authn_user.id,
        })
      : null;
    const conversation =
      selectedConversation ??
      (await selectCourseAgentConversations(ctx.course.id, ctx.locals.authn_user.id)).at(0);
    if (!conversation) {
      if (input?.conversationId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course-agent conversation not found' });
      }
      return { run: null, activeRunId: null, messages: [], warning: null };
    }
    let saved = await selectCourseAgentHistory(conversation.id);
    const runId = saved.messages.filter((message) => message.role === 'user').at(-1)?.run_id;
    if (!runId) return { run: null, activeRunId: null, messages: [], warning: null };
    const run = { conversationId: conversation.id, sandboxId: conversation.sandbox_id, runId };
    let activeRunId: string | null = null;
    let warning: string | null = null;
    try {
      const snapshot = await getEphemeralCourseAgentSnapshot({
        ...run,
        courseId: ctx.course.id,
        userId: ctx.locals.authn_user.id,
      });
      await persistCourseAgentSnapshot({ snapshot, runId });
      activeRunId = snapshot.activeRunId;
      saved = await selectCourseAgentHistory(conversation.id);
    } catch {
      warning = 'Saved conversation loaded. The agent workspace is currently unavailable.';
    }
    return { run, activeRunId, messages: await restoreCourseAgentMessages(saved), warning };
  });

const selectConversation = courseAgentProcedure
  .input(z.object({ conversationId: z.uuid().nullable() }))
  .mutation(async ({ ctx, input }) => {
    if (input.conversationId) {
      const conversation = await selectOptionalCourseAgentConversation({
        conversationId: input.conversationId,
        courseId: ctx.course.id,
        userId: ctx.locals.authn_user.id,
      });
      if (!conversation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course-agent conversation not found' });
      }
    }
    ctx.session.course_agent_conversation_id = input.conversationId;
  });

const settings = courseAgentProcedure
  .input(z.object({ expanded: z.boolean() }))
  .mutation(({ ctx, input }) => {
    ctx.session.course_agent_expanded = input.expanded;
  });

const getApprovalMode = courseAgentProcedure
  .output(z.object({ mode: z.enum(['ask', 'always']) }))
  .query(async ({ ctx }) => {
    const settings = await selectUserSettings({ user_id: ctx.locals.authn_user.id });
    return { mode: settings.course_agent_approval_mode };
  });

const setApprovalMode = courseAgentProcedure
  .input(z.object({ mode: z.enum(['ask', 'always']) }))
  .output(z.object({ mode: z.enum(['ask', 'always']) }))
  .mutation(async ({ ctx, input }) => {
    const settings = await updateCourseAgentApprovalMode({
      user_id: ctx.locals.authn_user.id,
      course_agent_approval_mode: input.mode,
    });
    return { mode: settings.course_agent_approval_mode };
  });

async function resolvePushApproval({
  ctx,
  approvalId,
  decision,
}: {
  ctx: TRPCContext;
  approvalId: string;
  decision: 'approve' | 'deny';
}) {
  const approval = await selectOptionalCourseAgentPushApproval({
    approvalId,
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
  if (decision === 'deny') {
    const denied = await updateCourseAgentPushApproval({
      approvalId: approval.id,
      status: 'denied',
      expectedStatuses: ['pending'],
      decidedBy: ctx.locals.authn_user.id,
      result: {
        message:
          'The instructor denied this proposal. Do not publish or resubmit it unchanged. Ask what should change if their reason is unclear.',
      },
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
    return { status: 'denied' as const, message: 'Denied request', published: false };
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
  let publicationResult: Awaited<ReturnType<typeof publishCourseAgentApproval>>;
  try {
    publicationResult = await publishCourseAgentApproval({
      approval: publishing,
      course: ctx.locals.course,
      user: ctx.locals.user,
      authzData: ctx.locals.authz_data,
    });
  } catch (error) {
    const message = courseAgentErrorMessage(error);
    const result = {
      message,
      published: error instanceof CourseAgentPublicationError && error.published,
      ...(error instanceof CourseAgentPublicationError
        ? { jobSequenceId: error.jobSequenceId, commitSha: error.commitSha }
        : {}),
    };
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
    return { status: 'failed' as const, message, published: result.published };
  }
  await updateCourseAgentPushApproval({
    approvalId: approval.id,
    status: 'completed',
    expectedStatuses: ['publishing'],
    decidedBy: ctx.locals.authn_user.id,
    result: publicationResult,
  });
  await respondToCourseAgentPushApproval({
    ...identity,
    approvalId: approval.id,
    decision: 'completed',
    result: publicationResult,
  });
  return {
    status: 'completed' as const,
    message: 'Changes published and course sync completed',
    published: true,
  };
}

const respondToPushApproval = courseAgentProcedure
  .input(
    z.object({
      approvalId: z.uuid(),
      decision: z.enum(['approve', 'deny']),
    }),
  )
  .output(
    z.object({
      status: z.enum(['denied', 'completed', 'failed']),
      message: z.string(),
      published: z.boolean(),
    }),
  )
  .mutation(({ ctx, input }) => resolvePushApproval({ ctx, ...input }));

export const courseAgentRouter = t.router({
  get,
  list,
  start,
  diagnostics,
  history,
  selectConversation,
  settings,
  getApprovalMode,
  setApprovalMode,
  respondToPushApproval,
});

export interface CourseAgentError {
  Get: never;
  List: never;
  Start: never;
  Diagnostics: never;
  History: never;
  SelectConversation: never;
  Settings: never;
  GetApprovalMode: never;
  SetApprovalMode: never;
  RespondToPushApproval: never;
}
