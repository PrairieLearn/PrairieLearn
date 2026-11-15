import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { cache } from '@prairielearn/cache';
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
  warmCourseAgentSandbox,
} from '../../ee/lib/course-agent/client.js';
import { buildPageCatalog } from '../../ee/lib/course-agent/pages.js';
import { formatCourseAgentConversationTitle } from '../../ee/lib/course-agent/title.js';
import {
  insertCourseAgentConversation,
  selectCourseAgentConversationsForUser,
  selectOptionalCourseAgentConversation,
  updateCourseAgentConversationTitle,
} from '../../ee/models/course-agent-conversation.js';
import {
  CourseAgentConversationUsageSchema,
  selectCourseAgentConversationUsage,
} from '../../ee/models/course-agent-usage-report.js';
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

// One warm sandbox at a time is enough for someone writing a first message. Where a cache is
// configured, this keeps repeated requests from starting containers nobody will use.
const WARM_SANDBOX_COOLDOWN_MS = 30_000;

/** The repository and branch the agent service binds a conversation to, if the course has them. */
function githubBinding(course: { repository: string | null; branch: string | null }) {
  const repository = parseGithubRepository(course.repository ?? '');
  if (!repository || !course.branch) return null;
  return CreateConversationInput.pick({ repository: true, branch: true }).safeParse({
    repository: `${repository.owner}/${repository.repo}`,
    branch: course.branch,
  });
}

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

  usage: courseAgentProcedure
    .input(z.object({ conversationId: IdSchema }))
    .output(CourseAgentConversationUsageSchema)
    .query(async ({ ctx, input }) => {
      const conversation = await selectOptionalCourseAgentConversation({
        id: input.conversationId,
        course_id: ctx.course.id,
        user_id: ctx.locals.authn_user.id,
      });
      if (!conversation) throw new TRPCError({ code: 'NOT_FOUND' });
      return selectCourseAgentConversationUsage(conversation.id);
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

  // The browser calls this when an instructor starts typing a new conversation's first message,
  // then names the same sandbox in `create`. It is an optimization only: nothing is recorded, and
  // a sandbox that cannot be started or is never used leaves `create` working as it always does.
  prewarm: courseAgentProcedure
    .input(z.object({ sandboxId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      // A local conversation uploads its course when it is created, so nothing can start early.
      if (config.devMode && !config.fileEditorUseGit) return;
      const binding = githubBinding(ctx.course);
      if (!binding?.success) return;
      const cooldownKey = `course-agent-warm-sandbox:${ctx.locals.authn_user.id}`;
      if (await cache.get(cooldownKey)) return;
      cache.set(cooldownKey, true, WARM_SANDBOX_COOLDOWN_MS);
      await warmCourseAgentSandbox(input.sandboxId, binding.data);
    }),

  // Record only conversations whose Cloudflare startup succeeded.
  create: courseAgentProcedure
    .input(
      z.object({
        text: z.string().trim().min(1).max(20_000),
        sandboxId: z.uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agentConversationId = await run(async () => {
        if (config.devMode && !config.fileEditorUseGit) {
          return createLocalCourseAgentConversation(
            ctx.course.path,
            buildPageCatalog({ course: ctx.course, authz_data: ctx.authz_data }),
          );
        } else {
          const binding = githubBinding(ctx.course);
          if (!binding) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Configure a GitHub repository and branch before starting a conversation.',
            });
          }
          if (!binding.success) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'The course repository or branch is invalid.',
            });
          }
          return createCourseAgentConversation({
            ...binding.data,
            pages: buildPageCatalog({ course: ctx.course, authz_data: ctx.authz_data }),
            warmSandboxId: input.sandboxId,
          });
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
  Usage: never;
  Create: never;
  Resume: never;
  GetReview: never;
  PostReviewDecision: never;
  SetTitle: never;
}
