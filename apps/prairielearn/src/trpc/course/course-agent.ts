import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { CreateConversationInput } from '@prairielearn/course-agent-types';
import { IdSchema } from '@prairielearn/zod';

import { courseAgentEnabled } from '../../ee/lib/course-agent/access.js';
import {
  createCourseAgentConversation,
  resumeCourseAgentConversation,
} from '../../ee/lib/course-agent/client.js';
import {
  insertCourseAgentConversation,
  selectCourseAgentConversationsForUser,
  selectOptionalCourseAgentConversation,
  updateCourseAgentConversationTitleIfDefault,
} from '../../ee/models/course-agent-conversation.js';
import { StaffCourseAgentConversationSchema } from '../../lib/client/safe-db-types.js';
import { parseGithubRepository } from '../../lib/github-utils.js';

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

  setTitle: courseAgentProcedure
    .input(z.object({ conversationId: IdSchema, text: z.string().trim().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) throw new TRPCError({ code: 'NOT_FOUND' });
      const title = input.text.replaceAll(/\s+/g, ' ');
      await updateCourseAgentConversationTitleIfDefault({
        id: conversation.id,
        title: title.length > 80 ? `${title.slice(0, 77)}...` : title,
      });
    }),

  resume: courseAgentProcedure
    .input(z.object({ conversationId: IdSchema }))
    .output(z.strictObject({ accepted: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) throw new TRPCError({ code: 'NOT_FOUND' });
      return resumeCourseAgentConversation(conversation.agent_conversation_id);
    }),

  // Record only conversations whose Cloudflare startup succeeded.
  create: courseAgentProcedure.mutation(async ({ ctx }) => {
    const repository = parseGithubRepository(ctx.course.repository ?? '');
    if (!repository || !ctx.course.branch) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Configure a GitHub repository and branch before starting a conversation.',
      });
    }
    const binding = CreateConversationInput.safeParse({
      repository: `${repository.owner}/${repository.repo}`,
      branch: ctx.course.branch,
    });
    if (!binding.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The course repository or branch is invalid.',
      });
    }
    const agentConversationId = await createCourseAgentConversation(binding.data);
    const conversation = await insertCourseAgentConversation({
      course_id: ctx.course.id,
      user_id: ctx.locals.authn_user.id,
      agent_conversation_id: agentConversationId,
    });
    return StaffCourseAgentConversationSchema.parse(conversation);
  }),
});

export interface CourseAgentError {
  List: never;
  Create: never;
  SetTitle: never;
  Resume: never;
}
