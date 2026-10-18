import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { courseAgentEnabled } from '../../ee/lib/course-agent/access.js';
import {
  createCourseAgentConversation,
  fetchCourseAgentMessages,
} from '../../ee/lib/course-agent/client.js';
import {
  insertCourseAgentConversation,
  selectCourseAgentConversationsForUser,
  selectOptionalCourseAgentConversation,
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
  create: courseAgentProcedure.mutation(async ({ ctx }) => {
    const agentConversationId = await createCourseAgentConversation();
    const conversation = await insertCourseAgentConversation({
      course_id: ctx.course.id,
      user_id: ctx.locals.authn_user.id,
      agent_conversation_id: agentConversationId,
    });
    return StaffCourseAgentConversationSchema.parse(conversation);
  }),

  messages: courseAgentProcedure
    .input(z.object({ conversationId: IdSchema }))
    .query(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
      }
      return await fetchCourseAgentMessages(conversation.agent_conversation_id);
    }),
});
