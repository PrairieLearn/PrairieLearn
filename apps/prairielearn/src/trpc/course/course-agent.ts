import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { courseAgentEnabled } from '../../ee/lib/course-agent/access.js';
import {
  createCourseAgentConversation,
  fetchCourseAgentSnapshot,
} from '../../ee/lib/course-agent/client.js';
import { CourseAgentCommandError, connectCourseAgent } from '../../ee/lib/course-agent/socket.js';
import {
  insertCourseAgentConversation,
  selectCourseAgentConversationsForUser,
  selectOptionalCourseAgentConversation,
  updateCourseAgentConversationTitleIfDefault,
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

async function serviceCommand(
  conversationId: string,
  action: (connection: Awaited<ReturnType<typeof connectCourseAgent>>) => Promise<unknown>,
) {
  const connection = await connectCourseAgent({ conversationId });
  try {
    return await action(connection);
  } catch (err) {
    if (err instanceof CourseAgentCommandError && err.code === 409) {
      throw new TRPCError({ code: 'CONFLICT', message: err.message });
    }
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: 'The command outcome is uncertain. Reconnect to check the conversation.',
    });
  } finally {
    connection.close();
  }
}

const conversationProcedure = courseAgentProcedure
  .input(z.object({ conversationId: IdSchema }))
  .use(async ({ ctx, input, next }) => {
    const conversation = await selectOptionalCourseAgentConversation({
      id: input.conversationId,
      course_id: ctx.course.id,
      user_id: ctx.locals.authn_user.id,
    });
    if (!conversation) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
    }
    return next({ ctx: { conversation } });
  });

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

  get: courseAgentProcedure
    .input(z.object({ conversationId: IdSchema, before: z.string().max(100).optional() }))
    .query(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
      }
      return await fetchCourseAgentSnapshot(conversation.agent_conversation_id, input.before);
    }),
  send: conversationProcedure
    .input(z.object({ text: z.string().trim().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      const result = await serviceCommand(ctx.conversation.agent_conversation_id, (connection) =>
        connection.command('turn.start', {
          text: input.text,
          context: {
            courseTitle: ctx.course.title ?? '',
            courseShortName: ctx.course.short_name,
          },
        }),
      );
      const title = input.text.replaceAll(/\s+/g, ' ').trim();
      await updateCourseAgentConversationTitleIfDefault({
        id: ctx.conversation.id,
        title: title.slice(0, 80),
      });
      return z.object({ turnId: z.uuid(), messageId: z.string() }).parse(result);
    }),
  stop: conversationProcedure
    .input(z.object({ turnId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await serviceCommand(ctx.conversation.agent_conversation_id, (connection) =>
        connection.command('turn.stop', { turnId: input.turnId }),
      );
    }),
  resume: conversationProcedure.mutation(async ({ ctx }) => {
    await serviceCommand(ctx.conversation.agent_conversation_id, (connection) =>
      connection.command('conversation.resume', {}),
    );
  }),
});

export interface CourseAgentError {
  List: never;
  Create: never;
  Get: never;
  Send: never;
  Stop: never;
  Resume: never;
}
