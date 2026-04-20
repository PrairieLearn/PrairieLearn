import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';
import { config } from '../../../lib/config.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import {
  adjustCreditPool,
  selectCreditPool,
  setCreditPoolBalance,
} from '../../../models/ai-grading-credit-pool.js';
import { selectCourseInstanceById } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { creditPoolProcedures, requireAiGradingFeature } from '../../lib/credit-pool-trpc.js';
import { refundCreditPurchase } from '../../models/ai-grading-credit-checkout-sessions.js';

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

function dollarsToCentPrecisionMilliDollars(dollars: number, label: string): number {
  const cents = Math.round(dollars * 100);
  // Reject values with sub-cent precision (e.g. 0.011). `dollars * 100` is
  // compared against its rounded form with a small epsilon to absorb the
  // binary float error from representing cent-precise decimals (e.g. 0.1 * 100
  // is 10.000000000000002, not exactly 10).
  if (Math.abs(dollars * 100 - cents) > 1e-9) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${label} must have at most 2 decimal places`,
    });
  }
  return cents * 10;
}

const adjustCreditPoolMutation = t.procedure
  .use(requireAiGradingFeature)
  .input(
    z.discriminatedUnion('action', [
      z.object({
        action: z.literal('add'),
        amount_dollars: z.number().positive(),
        credit_type: z.enum(['transferable', 'non_transferable']),
      }),
      z.object({
        action: z.literal('deduct'),
        amount_dollars: z.number().positive(),
        credit_type: z.enum(['transferable', 'non_transferable']),
      }),
      z.object({
        action: z.literal('set'),
        // Admins can set a negative balance for the transferable credit type.
        // The configured min/max per credit type is enforced below.
        balance_dollars: z.number(),
        credit_type: z.enum(['transferable', 'non_transferable']),
      }),
    ]),
  )
  .mutation(async (opts) => {
    if (opts.ctx.course_instance.deleted_at != null) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Cannot adjust credits for a deleted course instance',
      });
    }

    if (opts.input.action === 'set') {
      const { minMilliDollars, maxMilliDollars } =
        opts.input.credit_type === 'transferable'
          ? config.aiGradingCreditPoolLimits.setTransferable
          : config.aiGradingCreditPoolLimits.setNonTransferable;
      const targetMilliDollars = dollarsToCentPrecisionMilliDollars(
        opts.input.balance_dollars,
        'Balance',
      );
      if (targetMilliDollars < minMilliDollars || targetMilliDollars > maxMilliDollars) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Balance must be between ${formatMilliDollars(minMilliDollars)} and ${formatMilliDollars(maxMilliDollars)}`,
        });
      }
      await setCreditPoolBalance({
        course_instance_id: opts.ctx.course_instance.id,
        target_milli_dollars: targetMilliDollars,
        credit_type: opts.input.credit_type,
        user_id: opts.ctx.authn_user.id,
        reason: 'Admin set balance',
      });
      return await selectCreditPool(opts.ctx.course_instance.id);
    }

    const { minMilliDollars, maxMilliDollars } =
      opts.input.action === 'add'
        ? config.aiGradingCreditPoolLimits.add
        : config.aiGradingCreditPoolLimits.deduct;
    const amountMilliDollars = dollarsToCentPrecisionMilliDollars(
      opts.input.amount_dollars,
      'Amount',
    );
    if (amountMilliDollars < minMilliDollars || amountMilliDollars > maxMilliDollars) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Amount must be between ${formatMilliDollars(minMilliDollars)} and ${formatMilliDollars(maxMilliDollars)} for ${opts.input.action} adjustments`,
      });
    }

    if (opts.input.action === 'deduct') {
      const current = await selectCreditPool(opts.ctx.course_instance.id);
      const currentBalance =
        opts.input.credit_type === 'transferable'
          ? current.credit_transferable_milli_dollars
          : current.credit_non_transferable_milli_dollars;
      if (currentBalance <= 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot deduct from a non-positive balance',
        });
      }
    }

    const delta = amountMilliDollars * (opts.input.action === 'deduct' ? -1 : 1);
    await adjustCreditPool({
      course_instance_id: opts.ctx.course_instance.id,
      delta_milli_dollars: delta,
      credit_type: opts.input.credit_type,
      user_id: opts.ctx.authn_user.id,
      reason: `Admin ${opts.input.action}`,
    });
    return await selectCreditPool(opts.ctx.course_instance.id);
  });

const refundCreditPurchaseMutation = t.procedure
  .use(requireAiGradingFeature)
  .input(z.object({ checkout_session_id: IdSchema }))
  .mutation(async (opts) => {
    if (!config.stripeAiGradingCreditsRefundsEnabled) {
      throw new TRPCError({
        code: 'FORBIDDEN',
      });
    }
    await refundCreditPurchase({
      checkout_session_id: opts.input.checkout_session_id,
      course_instance_id: opts.ctx.course_instance.id,
      admin_user_id: opts.ctx.authn_user.id,
    });
    return await selectCreditPool(opts.ctx.course_instance.id);
  });

export const adminCreditPoolRouter = t.router({
  ...creditPoolProcedures,
  adjustCreditPool: adjustCreditPoolMutation,
  refundCreditPurchase: refundCreditPurchaseMutation,
});

export type AdminCreditPoolRouter = typeof adminCreditPoolRouter;
