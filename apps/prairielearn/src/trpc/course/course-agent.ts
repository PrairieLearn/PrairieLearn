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
  startEphemeralCourseAgentRun,
} from '../../ee/lib/course-agent/ephemeral-runtime.js';
import {
  CourseAgentConversationSchema,
  CourseAgentEventSchema,
  CourseAgentMessageSchema,
} from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import {
  createCourseAgentTurn,
  persistCourseAgentSnapshot,
  selectCourseAgentConversations,
  selectCourseAgentHistory,
  selectOptionalCourseAgentConversation,
} from '../../models/course-agent.js';

import {
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
    const snapshot = await getEphemeralCourseAgentSnapshot({
      userId: ctx.locals.authn_user.id,
      courseId: ctx.course.id,
      ...input,
    });
    await persistCourseAgentSnapshot({ snapshot, runId });
    const history = await selectCourseAgentHistory(conversation.id);
    return { ...snapshot, messages: history.messages, persistedEvents: history.events };
  });

const list = courseAgentProcedure
  .output(z.object({ conversations: z.array(CourseAgentConversationSchema) }))
  .query(async ({ ctx }) => ({
    conversations: await selectCourseAgentConversations(ctx.course.id, ctx.locals.authn_user.id),
  }));

export const courseAgentRouter = t.router({ get, list, start });
