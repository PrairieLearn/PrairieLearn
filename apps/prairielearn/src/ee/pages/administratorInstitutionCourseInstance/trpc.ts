import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { config } from '../../../lib/config.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { adjustCreditPool, selectCreditPool } from '../../../models/ai-grading-credit-pool.js';
import { selectCourseInstanceById } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { creditPoolProcedures, requireAiGradingFeature } from '../../lib/credit-pool-trpc.js';

export async function createAdminContext({ req, res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'plain'>;
  const course_instance = await selectCourseInstanceById(req.params.course_instance_id);
  const course = await selectCourseById(course_instance.course_id);

  if (course.institution_id !== req.params.institution_id) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course instance not found in this institution',
    });
  }

  return {
    course,
    course_instance,
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
    if (opts.ctx.course_instance.deleted_at != null) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Cannot adjust credits for a deleted course instance',
      });
    }
    const maxDollars =
      opts.input.action === 'add'
        ? config.aiGradingCreditPoolMaxAddDollars
        : config.aiGradingCreditPoolMaxDeductDollars;
    if (opts.input.amount_dollars > maxDollars) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Amount exceeds the maximum of $${maxDollars} for ${opts.input.action} adjustments`,
      });
    }
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
