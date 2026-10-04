import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { sendRequestSchema } from '@prairielearn/course-agent-contract';
import { IdSchema } from '@prairielearn/zod';

import { formatCourseAgentDate } from '../../lib/course-agent-date.js';
import { CourseAgentConversationSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import {
  type AgentScope,
  createConversation,
  nameConversation,
  reserveOperation,
  selectConversation,
} from '../../models/course-agent-conversation.js';

import { requireCoursePermissionOwn, requireNotExampleCourse, t } from './init.js';

const procedure = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireNotExampleCourse)
  .use(async ({ ctx, next }) => {
    if (!isEnterprise()) throw new TRPCError({ code: 'FORBIDDEN' });
    const { authorize, destination, provider, newWorkEnabled } =
      await import('../../ee/lib/course-agent/service.js');
    const service = { authorize, destination, provider, newWorkEnabled };
    const scope: AgentScope = {
      course_id: ctx.course.id,
      user_id: ctx.authz_data.user.id,
      authn_user_id: ctx.authz_data.authn_user.id,
    };
    await service.authorize(scope);
    return next({ ctx: { ...ctx, scope, service } });
  });
const CatalogSchema = CourseAgentConversationSchema.pick({
  id: true,
  title: true,
  created_at: true,
});
const id = z.object({ conversationId: IdSchema });
const newWorkProcedure = procedure.use(async ({ ctx, next }) => {
  await ctx.service.authorize(ctx.scope, true);
  return next();
});
export const courseAgentRouter = t.router({
  create: newWorkProcedure.output(CatalogSchema).mutation(({ ctx }) =>
    createConversation(ctx.scope, {
      title: 'New conversation',
      ...ctx.service.destination(ctx.course),
    }),
  ),
  send: newWorkProcedure
    .input(id.extend({ message: sendRequestSchema }))
    .mutation(async ({ ctx, input }) => {
      const c = await selectConversation(ctx.scope, input.conversationId);
      const chat = await ctx.service.provider(ctx.scope, c, true);
      const operationNumber = await reserveOperation(
        c,
        input.message.id,
        { kind: 'message', text: input.message.text },
        input.message.expectedOperationNumber,
      );
      const title = formatCourseAgentDate(c.created_at, ctx.course.display_timezone);
      const { observe } = await import('../../ee/lib/course-agent/observer.js');
      await nameConversation(c.id, title);
      await observe(c, chat, input.message.id);
      await chat.send(input.message, AbortSignal.timeout(120000));
      return { title, operationNumber };
    }),
  stop: procedure.input(id).mutation(async ({ ctx, input }) => {
    const chat = await ctx.service.provider(
      ctx.scope,
      await selectConversation(ctx.scope, input.conversationId),
    );
    await chat.cancel(AbortSignal.timeout(30000));
  }),
  cleanup: procedure.input(id).mutation(async ({ ctx, input }) => {
    const chat = await ctx.service.provider(
      ctx.scope,
      await selectConversation(ctx.scope, input.conversationId),
    );
    await chat.retryCleanup(AbortSignal.timeout(30000));
  }),
});

export interface CourseAgentError {
  Create: never;
  Send: never;
  Stop: never;
  Cleanup: never;
}
