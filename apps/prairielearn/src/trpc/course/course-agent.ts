import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { CourseAgentSnapshotSchema } from '@prairielearn/course-agent-protocol';

import {
  getEphemeralCourseAgentSnapshot,
  startEphemeralCourseAgentRun,
} from '../../ee/lib/course-agent/ephemeral-runtime.js';
import { features } from '../../lib/features/index.js';

import {
  requireAuthnCoursePermissionOwn,
  requireCoursePermissionOwn,
  requireNotExampleCourse,
  t,
} from './init.js';

export interface CourseAgentError {
  Get: never;
  Start: never;
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
    return startEphemeralCourseAgentRun({
      courseId: ctx.course.id,
      userId: ctx.locals.authn_user.id,
      conversationId: input.conversationId,
      prompt: input.prompt,
      course: {
        repository: ctx.course.repository,
        branch: ctx.course.branch,
        expectedSha: ctx.course.commit_hash,
      },
    });
  });

const get = courseAgentProcedure
  .input(z.object({ conversationId: z.uuid(), sandboxId: z.string() }))
  .output(CourseAgentSnapshotSchema)
  .query(async ({ ctx, input }) => {
    return getEphemeralCourseAgentSnapshot({
      userId: ctx.locals.authn_user.id,
      courseId: ctx.course.id,
      ...input,
    });
  });

export const courseAgentRouter = t.router({ get, start });
