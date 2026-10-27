import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { courseAgentEnabled } from '../../ee/lib/course-agent/access.js';
import { createCourseAgentConversation } from '../../ee/lib/course-agent/client.js';
import {
  insertCourseAgentConversation,
  selectCourseAgentConversationsForUser,
} from '../../ee/models/course-agent-conversation.js';
import { StaffCourseAgentConversationSchema } from '../../lib/client/safe-db-types.js';

import { requireCoursePermissionOwn, t } from './init.js';

const requireCourseAgent = t.middleware(async (opts) => {
  if (!(await courseAgentEnabled(opts.ctx.locals))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'The course agent is not available in this course.',
    });
  }
  return opts.next();
});

const courseAgentProcedure = t.procedure.use(requireCoursePermissionOwn).use(requireCourseAgent);

export const courseAgentRouter = t.router({
  list: courseAgentProcedure.query(async ({ ctx }) => {
    const conversations = await selectCourseAgentConversationsForUser({
      course_id: ctx.course.id,
      user_id: ctx.locals.authn_user.id,
    });
    return z.array(StaffCourseAgentConversationSchema).parse(conversations);
  }),

  // Record only conversations whose Cloudflare startup succeeded.
  create: courseAgentProcedure
    .input(z.object({ text: z.string().trim().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      const agentConversationId = await createCourseAgentConversation();
      const title = input.text.replaceAll(/\s+/g, ' ');
      const conversation = await insertCourseAgentConversation({
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
        agent_conversation_id: agentConversationId,
        title: title.length > 80 ? `${title.slice(0, 77)}...` : title,
      });
      return StaffCourseAgentConversationSchema.parse(conversation);
    }),
});

export interface CourseAgentError {
  List: never;
  Create: never;
}
