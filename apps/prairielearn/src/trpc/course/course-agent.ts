import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { CourseAgentSnapshotSchema } from '@prairielearn/course-agent-protocol';

import {
  getEphemeralCourseAgentSnapshot,
  startEphemeralCourseAgentRun,
} from '../../ee/lib/course-agent/ephemeral-runtime.js';
import { publicCourseAgentEvent } from '../../ee/lib/course-agent/public-events.js';
import { features } from '../../lib/features/index.js';

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
    return startEphemeralCourseAgentRun({
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
      conversationId: input.conversationId,
      prompt: input.prompt,
    });
  });

const get = courseAgentProcedure
  .input(z.object({ conversationId: z.uuid(), sandboxId: z.string() }))
  .output(CourseAgentSnapshotSchema)
  .query(async ({ ctx, input }) => {
    const snapshot = await getEphemeralCourseAgentSnapshot({
      userId: ctx.locals.authn_user.id,
      courseId: ctx.course.id,
      ...input,
    });
    return {
      ...snapshot,
      events: snapshot.events.flatMap((event) => publicCourseAgentEvent(event) ?? []),
    };
  });

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

export const courseAgentRouter = t.router({ get, start, diagnostics });
