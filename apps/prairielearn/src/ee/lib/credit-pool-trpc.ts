import { TRPCError, experimental_standaloneMiddleware, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

import { features } from '../../lib/features/index.js';
import {
  selectCreditPool,
  selectCreditPoolChangesBatched,
  selectDailySpending,
  selectDailySpendingGrouped,
} from '../../models/ai-grading-credit-pool.js';
import { ChartDaysSchema, DEFAULT_CHART_DAYS } from '../components/ai-grading-credits/constants.js';

interface CreditPoolBaseContext {
  course: { institution_id: string; id: string };
  course_instance: { id: string };
  authn_user: { id: string };
}

export const requireAiGradingFeature = experimental_standaloneMiddleware<{
  ctx: CreditPoolBaseContext;
}>().create(async (opts) => {
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

const t = initTRPC.context<CreditPoolBaseContext>().create({
  transformer: superjson,
});

const protectedProcedure = t.procedure.use(requireAiGradingFeature);

export const creditPoolProcedures = {
  creditPool: protectedProcedure.query(async (opts) => {
    return await selectCreditPool(opts.ctx.course_instance.id);
  }),
  creditPoolChanges: protectedProcedure
    .input(z.object({ page: z.number().int().min(1).default(1) }))
    .query(async (opts) => {
      return await selectCreditPoolChangesBatched(opts.ctx.course_instance.id, opts.input.page);
    }),
  dailySpending: protectedProcedure
    .input(z.object({ days: ChartDaysSchema.default(DEFAULT_CHART_DAYS) }))
    .query(async (opts) => {
      return await selectDailySpending(opts.ctx.course_instance.id, opts.input.days);
    }),
  dailySpendingGrouped: protectedProcedure
    .input(
      z.object({
        days: ChartDaysSchema.default(DEFAULT_CHART_DAYS),
        group_by: z.enum(['user', 'assessment', 'question']),
      }),
    )
    .query(async (opts) => {
      return await selectDailySpendingGrouped(
        opts.ctx.course_instance.id,
        opts.input.days,
        opts.input.group_by,
      );
    }),
};

// Standalone router from the shared procedures, used for client-side type extraction.
const _creditPoolRouter = t.router(creditPoolProcedures);
export type CreditPoolRouter = typeof _creditPoolRouter;
