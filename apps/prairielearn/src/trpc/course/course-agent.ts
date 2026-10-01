import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  ChatError,
  approvalDecisionSchema,
  sendRequestSchema,
} from '@prairielearn/course-agent-contract';
import { IdSchema } from '@prairielearn/zod';

import { formatCourseAgentDate } from '../../lib/course-agent-date.js';
import { CourseAgentPanelStateSchema } from '../../lib/course-agent-panel.js';
import { CourseAgentConversationSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import {
  type AgentScope,
  createConversation,
  nameConversation,
  selectConversation,
  selectConversationActivity,
} from '../../models/course-agent-conversation.js';
import { rejectExecution } from '../../models/course-agent-execution.js';
import { selectOptionalProposal } from '../../models/course-agent-proposal.js';

import { requireCoursePermissionOwn, requireNotExampleCourse, t } from './init.js';

const procedure = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireNotExampleCourse)
  .use(async ({ ctx, next }) => {
    if (!isEnterprise()) throw new TRPCError({ code: 'FORBIDDEN' });
    const { authorize, destination, provider, prepare, complete } =
      await import('../../ee/lib/course-agent/service.js');
    const service = { authorize, destination, provider, prepare, complete };
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
  panel: procedure.input(CourseAgentPanelStateSchema).mutation(({ ctx, input }) => {
    const key = `${ctx.course.id}:${ctx.scope.user_id}`;
    ctx.session.course_agent_panels ??= {};
    ctx.session.course_agent_panels[key] = input;
  }),
  list: procedure
    .output(
      z.array(CatalogSchema.extend({ running: z.boolean(), finishedAt: z.string().nullable() })),
    )
    .query(async ({ ctx }) =>
      (await selectConversationActivity(ctx.scope)).map(
        ({ conversation, running, finished_at }) => ({
          ...conversation,
          title:
            conversation.title === 'New conversation'
              ? conversation.title
              : formatCourseAgentDate(conversation.created_at, ctx.course.display_timezone),
          running,
          finishedAt: finished_at?.toISOString() ?? null,
        }),
      ),
    ),
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
      const { admit, recordUsage } = await import('../../ee/lib/course-agent/usage.js');
      await recordUsage(c, await chat.getSnapshot(AbortSignal.timeout(10000)));
      await admit(c, input.message);
      const title = formatCourseAgentDate(c.created_at, ctx.course.display_timezone);
      await nameConversation(c.id, title);
      const { observe } = await import('../../ee/lib/course-agent/observer.js');
      await observe(c, chat, (tool) => ctx.service.prepare(ctx.scope, c, tool));
      try {
        await chat.send(input.message, AbortSignal.timeout(120000));
      } catch (error) {
        if (error instanceof ChatError && [400, 409].includes(error.status)) {
          await rejectExecution(c.id, input.message.id);
        }
        throw error;
      }
      return { title };
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
  decide: procedure
    .input(id.extend({ decision: approvalDecisionSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.service.complete(
        ctx.scope,
        await selectConversation(ctx.scope, input.conversationId),
        input.decision,
      ),
    ),
  prepare: procedure
    .input(id.extend({ operationId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const c = await selectConversation(ctx.scope, input.conversationId);
      const row = await selectOptionalProposal(c.id, input.operationId);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.service.prepare(ctx.scope, c, {
        id: row.operation_id,
        sequence: row.sequence,
        name: 'push_sync',
        args: row.payload,
      });
    }),
});

export interface CourseAgentError {
  Panel: never;
  List: never;
  Create: never;
  Send: never;
  Stop: never;
  Cleanup: never;
  Decide: never;
  Prepare: never;
}
