import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import type { Course, CourseInstance } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import {
  adjustCreditPool,
  selectCreditPool,
  selectCreditPoolChangesBatched,
  selectDailySpending,
} from '../../../models/ai-grading-credit-pool.js';

export function createAdminContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as {
    course: Course;
    course_instance: CourseInstance;
    authn_user: { id: string };
  };

  return {
    course: locals.course,
    course_instance: locals.course_instance,
    authn_user: locals.authn_user,
  };
}

type AdminTRPCContext = Awaited<ReturnType<typeof createAdminContext>>;

const t = initTRPC.context<AdminTRPCContext>().create({
  transformer: superjson,
});

const requireAiGradingFeature = t.middleware(async (opts) => {
  const enabled = await features.enabled('ai-grading', {
    institution_id: opts.ctx.course.institution_id,
    course_id: opts.ctx.course.id,
    course_instance_id: opts.ctx.course_instance.id,
    user_id: opts.ctx.authn_user.id,
  });

  if (!enabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (feature not available)',
    });
  }
  return opts.next();
});

const creditPoolQuery = t.procedure.use(requireAiGradingFeature).query(async (opts) => {
  return await selectCreditPool(opts.ctx.course_instance.id);
});

const creditPoolChangesQuery = t.procedure
  .use(requireAiGradingFeature)
  .input(z.object({ page: z.number().int().min(1).default(1) }))
  .query(async (opts) => {
    return await selectCreditPoolChangesBatched(opts.ctx.course_instance.id, opts.input.page);
  });

const dailySpendingQuery = t.procedure
  .use(requireAiGradingFeature)
  .input(
    z.object({
      days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(30),
    }),
  )
  .query(async (opts) => {
    return await selectDailySpending(opts.ctx.course_instance.id, opts.input.days);
  });

const adjustCreditPoolMutation = t.procedure
  .use(requireAiGradingFeature)
  .input(
    z.object({
      action: z.enum(['add', 'deduct']),
      amount_dollars: z.number().positive(),
      credit_type: z.enum(['transferable', 'non_transferable']),
    }),
  )
  .mutation(async (opts) => {
    const delta =
      Math.round(opts.input.amount_dollars * 1000) * (opts.input.action === 'deduct' ? -1 : 1);
    await adjustCreditPool({
      course_instance_id: opts.ctx.course_instance.id,
      delta_milli_dollars: delta,
      credit_type: opts.input.credit_type,
      user_id: opts.ctx.authn_user.id,
      reason: `Admin ${opts.input.action}`,
    });
    return await selectCreditPool(opts.ctx.course_instance.id);
  });

export const adminCreditPoolRouter = t.router({
  creditPool: creditPoolQuery,
  creditPoolChanges: creditPoolChangesQuery,
  dailySpending: dailySpendingQuery,
  adjustCreditPool: adjustCreditPoolMutation,
});

export type AdminCreditPoolRouter = typeof adminCreditPoolRouter;
