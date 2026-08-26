import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  dispatchCourseAgentRun,
  getCourseAgentCoursePath,
  killCourseAgentSandbox,
} from '../../ee/lib/course-agent/runtime.js';
import { config } from '../../lib/config.js';
import { features } from '../../lib/features/index.js';
import {
  appendCourseAgentEvent,
  createCourseAgentConversation,
  createCourseAgentRun,
  deleteCourseAgentConversation,
  selectActiveCourseAgentRun,
  selectCourseAgentConversation,
  selectCourseAgentConversations,
  selectCourseAgentEvents,
  selectCourseAgentMessages,
  selectLatestCourseAgentRun,
  selectLatestCourseAgentWorkspaceBackup,
  updateCourseAgentAssistantMessage,
  updateCourseAgentConversationTitle,
  updateCourseAgentRun,
} from '../../models/course-agent.js';

import {
  requireAuthnCoursePermissionOwn,
  requireCoursePermissionOwn,
  requireNotExampleCourse,
  t,
} from './init.js';

export interface CourseAgentError {
  Create: never;
  Destroy: never;
  Get: never;
  KillSandbox: never;
  List: never;
  Rename: never;
  Submit: never;
}

const requireCloudAgentFeature = t.middleware(async (opts) => {
  if (!(await features.enabledFromLocals('cloud-agent', opts.ctx.locals))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Course agent feature is not enabled' });
  }
  return opts.next();
});

const courseAgentProcedure = t.procedure.use(requireCloudAgentFeature).use(requireNotExampleCourse);

async function requireOwnedConversation({
  conversationId,
  courseId,
  userId,
}: {
  conversationId: string;
  courseId: string;
  userId: string;
}) {
  const conversation = await selectCourseAgentConversation({ conversationId, courseId, userId });
  if (!conversation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Course-agent conversation not found' });
  }
  return conversation;
}

function serializeConversationState({
  conversation,
  activeRun,
  messages,
  events,
  latestBackup,
  latestRun,
}: {
  conversation: Awaited<ReturnType<typeof requireOwnedConversation>>;
  activeRun: Awaited<ReturnType<typeof selectActiveCourseAgentRun>>;
  messages: Awaited<ReturnType<typeof selectCourseAgentMessages>>;
  events: Awaited<ReturnType<typeof selectCourseAgentEvents>>;
  latestBackup: Awaited<ReturnType<typeof selectLatestCourseAgentWorkspaceBackup>>;
  latestRun: Awaited<ReturnType<typeof selectLatestCourseAgentRun>>;
}) {
  return {
    conversation,
    activeRun,
    latestRun,
    messages,
    events,
    latestBackup: latestBackup
      ? {
          id: latestBackup.id,
          sandbox_id: latestBackup.sandbox_id,
          workspace_manifest_version: latestBackup.workspace_manifest_version,
          course_commit_sha: latestBackup.course_commit_sha,
          reason: latestBackup.reason,
          size_bytes: latestBackup.size_bytes,
          expires_at: latestBackup.expires_at,
          created_at: latestBackup.created_at,
        }
      : null,
  };
}

const list = courseAgentProcedure
  .use(requireCoursePermissionOwn)
  .use(requireAuthnCoursePermissionOwn)
  .query(async ({ ctx }) => {
    return await selectCourseAgentConversations({
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
    });
  });

const create = courseAgentProcedure
  .use(requireCoursePermissionOwn)
  .use(requireAuthnCoursePermissionOwn)
  .input(z.object({ title: z.string().trim().min(1).max(120).optional() }))
  .mutation(async ({ ctx, input }) => {
    const conversation = await createCourseAgentConversation({
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
      title: input.title,
      coursePath: getCourseAgentCoursePath(ctx.course.short_name),
    });
    await appendCourseAgentEvent({
      conversationId: conversation.id,
      runId: null,
      eventType: 'conversation.created',
      data: { course_id: ctx.course.id, user_id: ctx.locals.authn_user.id },
    });
    return conversation;
  });

const get = courseAgentProcedure
  .use(requireCoursePermissionOwn)
  .use(requireAuthnCoursePermissionOwn)
  .input(
    z.object({
      conversationId: z.string(),
      afterSequence: z.string().default('0'),
    }),
  )
  .query(async ({ ctx, input }) => {
    const conversation = await requireOwnedConversation({
      conversationId: input.conversationId,
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
    });
    const [activeRun, latestRun, messages, events, latestBackup] = await Promise.all([
      selectActiveCourseAgentRun(conversation.id),
      selectLatestCourseAgentRun(conversation.id),
      selectCourseAgentMessages(conversation.id),
      selectCourseAgentEvents({
        conversationId: conversation.id,
        afterSequence: input.afterSequence,
      }),
      selectLatestCourseAgentWorkspaceBackup(conversation.id),
    ]);
    return serializeConversationState({
      conversation,
      activeRun,
      latestRun,
      messages,
      events,
      latestBackup,
    });
  });

const rename = courseAgentProcedure
  .use(requireCoursePermissionOwn)
  .use(requireAuthnCoursePermissionOwn)
  .input(z.object({ conversationId: z.string(), title: z.string().trim().min(1).max(120) }))
  .mutation(async ({ ctx, input }) => {
    const conversation = await requireOwnedConversation({
      conversationId: input.conversationId,
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
    });
    return await updateCourseAgentConversationTitle({
      conversationId: conversation.id,
      title: input.title,
    });
  });

const submit = courseAgentProcedure
  .use(requireCoursePermissionOwn)
  .use(requireAuthnCoursePermissionOwn)
  .input(z.object({ conversationId: z.string(), prompt: z.string().trim().min(1).max(100_000) }))
  .mutation(async ({ ctx, input }) => {
    if (config.courseAgentRuntime === 'disabled') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Course agent runtime is disabled',
      });
    }
    const repository = ctx.course.repository;
    const branch = ctx.course.branch;
    if (!repository || !branch) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'The course must have a Git repository and branch configured',
      });
    }

    const conversation = await requireOwnedConversation({
      conversationId: input.conversationId,
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
    });
    if (await selectActiveCourseAgentRun(conversation.id)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This conversation already has an active agent run',
      });
    }

    const created = await createCourseAgentRun({
      conversationId: conversation.id,
      authnUserId: ctx.locals.authn_user.id,
      prompt: input.prompt,
      baseCommitSha: ctx.course.commit_hash,
    });

    try {
      await dispatchCourseAgentRun({
        conversation,
        run: created.run,
        prompt: input.prompt,
        course: {
          id: ctx.course.id,
          shortName: ctx.course.short_name,
          repository,
          branch,
          commitHash: ctx.course.commit_hash,
        },
        userId: ctx.locals.authn_user.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateCourseAgentRun({
        runId: created.run.id,
        status: 'failed',
        errorCode: 'runtime_dispatch_failed',
        errorMessage: message,
        markCompleted: true,
      });
      await updateCourseAgentAssistantMessage({
        conversationId: conversation.id,
        runId: created.run.id,
        status: 'errored',
        parts: [{ type: 'text', text: message }],
      });
      await appendCourseAgentEvent({
        conversationId: conversation.id,
        runId: created.run.id,
        eventType: 'run.failed',
        data: { code: 'runtime_dispatch_failed', message },
      });
      throw new TRPCError({ code: 'BAD_GATEWAY', message });
    }

    return created;
  });

const destroy = courseAgentProcedure
  .use(requireCoursePermissionOwn)
  .use(requireAuthnCoursePermissionOwn)
  .input(z.object({ conversationId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const conversation = await requireOwnedConversation({
      conversationId: input.conversationId,
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
    });
    if (await selectActiveCourseAgentRun(conversation.id)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Wait for the active agent run to finish before deleting this chat',
      });
    }
    if (!['unallocated', 'offline'].includes(conversation.runtime_status)) {
      await killCourseAgentSandbox({
        conversation,
        course: { id: ctx.course.id },
        userId: ctx.locals.authn_user.id,
        hard: false,
        reason: 'conversation_deleted',
      });
    }
    return await deleteCourseAgentConversation(conversation.id);
  });

const killSandbox = courseAgentProcedure
  .use(requireCoursePermissionOwn)
  .use(requireAuthnCoursePermissionOwn)
  .input(z.object({ conversationId: z.string(), hard: z.boolean().default(false) }))
  .mutation(async ({ ctx, input }) => {
    if (
      !config.devMode ||
      !config.courseAgentTestControlsEnabled ||
      !(await features.enabledFromLocals('cloud-agent-test-controls', ctx.locals))
    ) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Course-agent test controls are disabled',
      });
    }
    const conversation = await requireOwnedConversation({
      conversationId: input.conversationId,
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
    });
    await killCourseAgentSandbox({
      conversation,
      course: { id: ctx.course.id },
      userId: ctx.locals.authn_user.id,
      hard: input.hard,
      reason: 'test_kill',
    });
    return { success: true };
  });

export const courseAgentRouter = t.router({
  create,
  destroy,
  get,
  killSandbox,
  list,
  rename,
  submit,
});
