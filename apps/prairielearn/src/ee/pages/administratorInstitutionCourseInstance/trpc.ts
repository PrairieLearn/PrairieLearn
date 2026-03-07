import { initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import type { Course, CourseInstance } from '../../../lib/db-types.js';
import { adjustCreditPool, selectCreditPool } from '../../../models/ai-grading-credit-pool.js';
import { creditPoolProcedures, requireAiGradingFeature } from '../../lib/credit-pool-trpc.js';

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
  ...creditPoolProcedures,
  adjustCreditPool: adjustCreditPoolMutation,
});

export type AdminCreditPoolRouter = typeof adminCreditPoolRouter;
