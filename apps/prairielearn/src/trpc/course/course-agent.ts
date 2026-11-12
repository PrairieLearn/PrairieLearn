import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { CreateConversationInput } from '@prairielearn/course-agent-types';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { courseAgentEnabled } from '../../ee/lib/course-agent/access.js';
import {
  getReview,
  postReviewDecision,
  resumeConversation,
} from '../../ee/lib/course-agent/apply-changes.js';
import {
  createCourseAgentConversation,
  createLocalCourseAgentConversation,
} from '../../ee/lib/course-agent/client.js';
import { formatCourseAgentConversationTitle } from '../../ee/lib/course-agent/title.js';
import {
  insertCourseAgentConversation,
  selectCourseAgentConversationsForUser,
  selectOptionalCourseAgentConversation,
  updateCourseAgentConversationTitle,
} from '../../ee/models/course-agent-conversation.js';
import { StaffCourseAgentConversationSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
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
  getReview: courseAgentProcedure
    .input(z.object({ conversationId: IdSchema, reviewId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) throw new TRPCError({ code: 'NOT_FOUND' });
      return getReview(ctx.course, conversation, input.reviewId);
    }),
  postReviewDecision: courseAgentProcedure
    .input(
      z.discriminatedUnion('decision', [
        z.object({
          conversationId: IdSchema,
          reviewId: z.uuid(),
          decision: z.literal('approved'),
        }),
        z.object({
          conversationId: IdSchema,
          reviewId: z.uuid(),
          decision: z.literal('denied'),
          viaMessage: z.boolean().optional(),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) throw new TRPCError({ code: 'NOT_FOUND' });
      return postReviewDecision({
        ...input,
        course: ctx.course,
        conversation,
        user: ctx.locals.user,
        authzData: ctx.authz_data,
      });
    }),
  list: courseAgentProcedure.query(async ({ ctx }) => {
    const conversations = await selectCourseAgentConversationsForUser({
      course_id: ctx.course.id,
      user_id: ctx.locals.authn_user.id,
    });
    return z.array(StaffCourseAgentConversationSchema).parse(conversations);
  }),

  resume: courseAgentProcedure
    .input(z.object({ conversationId: IdSchema }))
    .output(z.strictObject({ recovered: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) throw new TRPCError({ code: 'NOT_FOUND' });
      return resumeConversation(conversation);
    }),

  // Record only conversations whose Cloudflare startup succeeded.
  create: courseAgentProcedure
    .input(z.object({ text: z.string().trim().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      const agentConversationId = await run(async () => {
        if (config.devMode && !config.fileEditorUseGit) {
          return createLocalCourseAgentConversation(ctx.course.path);
        } else {
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
          return createCourseAgentConversation(binding.data);
        }
      });
      const conversation = await insertCourseAgentConversation({
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
        agent_conversation_id: agentConversationId,
        title: formatCourseAgentConversationTitle(input.text),
      });
      return StaffCourseAgentConversationSchema.parse(conversation);
    }),

  // The agent service generates a title from the first message and publishes it to the
  // conversation's owner, whose browser saves it here.
  setTitle: courseAgentProcedure
    .input(z.object({ conversationId: IdSchema, title: z.string().trim().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) throw new TRPCError({ code: 'NOT_FOUND' });
      const updated = await updateCourseAgentConversationTitle({
        conversation,
        title: input.title,
      });
      return StaffCourseAgentConversationSchema.parse(updated);
    }),
});

export interface CourseAgentError {
  List: never;
  Create: never;
  Resume: never;
  GetReview: never;
  PostReviewDecision: never;
  SetTitle: never;
}
