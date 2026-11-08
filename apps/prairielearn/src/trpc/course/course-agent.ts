import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { CreateConversationInput, NavigationTargetSchema } from '@prairielearn/course-agent-types';
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
import {
  insertCourseAgentConversation,
  selectCourseAgentConversationsForUser,
  selectOptionalCourseAgentConversation,
} from '../../ee/models/course-agent-conversation.js';
import { StaffCourseAgentConversationSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { parseGithubRepository } from '../../lib/github-utils.js';
import { selectOptionalAssessmentByTid } from '../../models/assessment.js';
import { selectOptionalCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectOptionalQuestionByQid } from '../../models/question.js';

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
      z.object({
        conversationId: IdSchema,
        reviewId: z.uuid(),
        decision: z.enum(['approved', 'denied']),
      }),
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

  /** The URL of a page the agent named the way course files do. */
  resolveNavigation: courseAgentProcedure
    .input(NavigationTargetSchema)
    .output(z.strictObject({ url: z.string() }))
    .query(async ({ ctx, input }) => {
      const notFound = (message: string) => new TRPCError({ code: 'NOT_FOUND', message });
      const courseInstance = input.courseInstance
        ? await selectOptionalCourseInstanceByShortName({
            course: ctx.course,
            shortName: input.courseInstance,
          })
        : null;
      if (input.courseInstance && !courseInstance) {
        throw notFound(`No course instance named "${input.courseInstance}".`);
      }
      const base = courseInstance
        ? `/pl/course_instance/${courseInstance.id}/instructor`
        : `/pl/course/${ctx.course.id}`;
      if (input.assessment) {
        if (!courseInstance) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'An assessment needs its course instance.',
          });
        }
        const assessment = await selectOptionalAssessmentByTid({
          course_instance_id: courseInstance.id,
          tid: input.assessment,
        });
        if (!assessment) throw notFound(`No assessment named "${input.assessment}".`);
        return { url: `${base}/assessment/${assessment.id}/${input.page ?? 'questions'}` };
      }
      if (input.question) {
        const question = await selectOptionalQuestionByQid({
          qid: input.question,
          course_id: ctx.course.id,
        });
        if (!question) throw notFound(`No question named "${input.question}".`);
        return { url: `${base}/question/${question.id}/${input.page ?? 'preview'}` };
      }
      const page =
        input.page ?? (courseInstance ? 'instance_admin/assessments' : 'course_admin/questions');
      return { url: `${base}/${page}` };
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
  Resume: never;
  GetReview: never;
  PostReviewDecision: never;
  ResolveNavigation: never;
}
