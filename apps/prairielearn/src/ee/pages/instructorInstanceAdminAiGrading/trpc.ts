import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { config } from '../../../lib/config.js';
import { EnumAiGradingProviderSchema } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { encryptForStorage } from '../../../lib/storage-crypt.js';
import {
  deleteCredential,
  updateUseCustomApiKeys,
  upsertCredential,
} from '../../../models/ai-grading-credentials.js';
import { selectInstitutionForCourse } from '../../../models/institution.js';
import {
  MAX_PURCHASE_MILLI_DOLLARS,
  MIN_PURCHASE_MILLI_DOLLARS,
  calculateCreditPurchaseCharge,
} from '../../lib/ai-grading-credit-purchase-constants.js';
import { getOrCreateStripeCustomerId, getStripeClient } from '../../lib/billing/stripe.js';
import { creditPoolProcedures, requireAiGradingFeature } from '../../lib/credit-pool-trpc.js';
import { insertCreditCheckoutSession } from '../../models/ai-grading-credit-checkout-sessions.js';

import { formatCredential } from './utils/format.js';

export function createContext({ req, res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'course-instance'>;

  const host = config.serverCanonicalHost ?? `${req.protocol}://${req.get('host')}`;

  return {
    course: locals.course,
    course_instance: locals.course_instance,
    authn_user: locals.authn_user,
    authz_data: locals.authz_data,
    host,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const requireEditPermission = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_own) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied',
    });
  }
  return opts.next();
});

const updateUseCustomApiKeysMutation = t.procedure
  .use(requireEditPermission)
  .use(requireAiGradingFeature)
  .input(z.object({ enabled: z.boolean() }))
  .mutation(async (opts) => {
    await updateUseCustomApiKeys({
      course_instance_id: opts.ctx.course_instance.id,
      ai_grading_use_custom_api_keys: opts.input.enabled,
    });
    return { useCustomApiKeys: opts.input.enabled };
  });

const addCredentialMutation = t.procedure
  .use(requireEditPermission)
  .use(requireAiGradingFeature)
  .input(
    z.object({
      provider: EnumAiGradingProviderSchema,
      secret_key: z.string().trim().min(1),
    }),
  )
  .mutation(async (opts) => {
    const encrypted = encryptForStorage(opts.input.secret_key);
    const row = await upsertCredential({
      course_instance_id: opts.ctx.course_instance.id,
      provider: opts.input.provider,
      encrypted_secret_key: encrypted,
      created_by: opts.ctx.authn_user.id,
    });
    return {
      credential: formatCredential(row, opts.ctx.course_instance.display_timezone),
    };
  });

const deleteCredentialMutation = t.procedure
  .use(requireEditPermission)
  .use(requireAiGradingFeature)
  .input(z.object({ credential_id: z.string() }))
  .mutation(async (opts) => {
    await deleteCredential({
      credential_id: opts.input.credential_id,
      course_instance_id: opts.ctx.course_instance.id,
      authn_user_id: opts.ctx.authn_user.id,
    });
  });

const createCheckoutMutation = t.procedure
  .use(requireEditPermission)
  .use(requireAiGradingFeature)
  .input(
    z.object({
      amount_milli_dollars: z
        .number()
        .int()
        .min(MIN_PURCHASE_MILLI_DOLLARS)
        .max(MAX_PURCHASE_MILLI_DOLLARS),
    }),
  )
  .mutation(async (opts) => {
    if (!config.stripeSecretKey) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Stripe is not configured.',
      });
    }

    if (!config.stripeAiGradingCreditsProductId) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'AI grading credits product is not configured.',
      });
    }

    const { authn_user, course, course_instance, host } = opts.ctx;
    const amountMilliDollars = opts.input.amount_milli_dollars;
    const { stripe_amount_cents } = calculateCreditPurchaseCharge({
      amount_milli_dollars: amountMilliDollars,
    });

    const stripe = getStripeClient();
    const institution = await selectInstitutionForCourse({ course_id: course.id });
    const customerId = await getOrCreateStripeCustomerId(authn_user.id, {
      name: authn_user.name,
    });

    const urlBase = `${host}/pl/course_instance/${course_instance.id}/instructor/instance_admin/ai_grading`;

    const metadata = {
      prairielearn_type: 'ai_grading_credits',
      prairielearn_institution_id: institution.id,
      prairielearn_institution_name: `${institution.long_name} (${institution.short_name})`,
      prairielearn_course_id: course.id,
      prairielearn_course_name: `${course.short_name}: ${course.title}`,
      prairielearn_course_instance_id: course_instance.id,
      prairielearn_course_instance_name: `${course_instance.long_name} (${course_instance.short_name})`,
      prairielearn_user_id: authn_user.id,
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_update: {
        name: 'auto',
        address: 'auto',
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product: config.stripeAiGradingCreditsProductId,
            unit_amount: stripe_amount_cents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${urlBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${urlBase}?checkout=cancelled`,
      metadata,
      payment_intent_data: {
        metadata,
        receipt_email: authn_user.email ?? undefined,
      },
    });

    if (!session.url) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create checkout session. Please try again.',
      });
    }

    await insertCreditCheckoutSession({
      agent_user_id: authn_user.id,
      stripe_object_id: session.id,
      course_instance_id: course_instance.id,
      data: session,
      amount_milli_dollars: amountMilliDollars,
    });

    return { checkoutUrl: session.url };
  });

export const aiGradingSettingsRouter = t.router({
  ...creditPoolProcedures,
  updateUseCustomApiKeys: updateUseCustomApiKeysMutation,
  addCredential: addCredentialMutation,
  deleteCredential: deleteCredentialMutation,
  createCheckout: createCheckoutMutation,
});

export type AiGradingSettingsRouter = typeof aiGradingSettingsRouter;
