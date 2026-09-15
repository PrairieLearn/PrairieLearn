import { TRPCError } from '@trpc/server';

import { isEnterprise } from '../../lib/license.js';

import { requireCoursePermissionOwn, t } from './init.js';

export interface VercelCourseAgentError {
  Create: never;
}

export const vercelCourseAgentRouter = t.router({
  create: t.procedure.use(requireCoursePermissionOwn).mutation(async ({ ctx }) => {
    if (!isEnterprise() || !ctx.locals.vercel_course_agent_enabled) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Course agent is not enabled.' });
    }
    const { createConversation } =
      await import('../../ee/lib/vercel-course-agent/conversations.js');
    return createConversation(
      {
        courseId: ctx.course.id,
        userId: ctx.locals.user.id,
        authnUserId: ctx.locals.authn_user.id,
      },
      ctx.course,
    );
  }),
});
