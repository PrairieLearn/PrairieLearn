import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../../components/PageLayout.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { handleTrpcError } from '../../../lib/trpc.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCredentials } from '../../../models/ai-grading-credentials.js';
import { adjustCreditPool } from '../../../models/ai-grading-credit-pool.js';
import { getStripeClient } from '../../lib/billing/stripe.js';
import {
  getAiGradingCreditCheckoutSessionByStripeObjectId,
  markAiGradingCreditCheckoutSessionCompleted,
  updateAiGradingCreditCheckoutSessionData,
} from '../../models/ai-grading-credit-checkout-sessions.js';

import { InstructorInstanceAdminAiGrading } from './instructorInstanceAdminAiGrading.html.js';
import { aiGradingSettingsRouter, createContext } from './trpc.js';
import { formatCredential, formatCredentialRedacted } from './utils/format.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    if (!aiGradingEnabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    const {
      course_instance: courseInstance,
      course,
      authz_data: authzData,
      authn_user,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const canEdit = authzData.has_course_permission_own;

    const aiGradingModelSelectionEnabled = await features.enabled('ai-grading-model-selection', {
      institution_id: course.institution_id,
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: authn_user.id,
    });

    const dbCredentials = await selectCredentials(courseInstance.id);
    const credentials = dbCredentials.map((c) =>
      canEdit
        ? formatCredential(c, courseInstance.display_timezone)
        : formatCredentialRedacted(c, courseInstance.display_timezone),
    );

    // Generate a prefix-based CSRF token scoped to the tRPC endpoint for this page.
    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: req.originalUrl.split('?')[0] + '/trpc',
        authn_user_id: authn_user.id,
      },
      config.secretKey,
    );

    const stripePurchasingEnabled =
      !!config.stripeSecretKey && !!config.stripeAiGradingCreditsProductId;

    // If the user just returned from a successful Stripe checkout, eagerly
    // process the session so credits are available immediately (the webhook
    // serves as a backup but may arrive later or not at all in local dev).
    let checkoutStatus: 'success' | 'cancelled' | null = null;
    let checkoutAmountCents: number | null = null;
    if (canEdit && req.query.checkout === 'success' && req.query.session_id) {
      const stripeSessionId = z.string().parse(req.query.session_id);
      const localSession = await getAiGradingCreditCheckoutSessionByStripeObjectId(stripeSessionId);

      if (localSession) {
        checkoutAmountCents = localSession.amount_cents;

        if (!localSession.credits_added) {
          if (
            localSession.course_instance_id !== courseInstance.id ||
            localSession.agent_user_id !== authn_user.id
          ) {
            throw new error.HttpStatusError(400, 'Invalid session');
          }

          const stripe = getStripeClient();
          const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

          if (session.payment_status === 'paid') {
            const deltaMilliDollars = localSession.amount_cents * 10;
            await runInTransactionAsync(async () => {
              // Atomically claim this session to prevent double-crediting
              // if the webhook fires concurrently.
              const claimed = await markAiGradingCreditCheckoutSessionCompleted(stripeSessionId);
              if (!claimed) return;

              await adjustCreditPool({
                course_instance_id: localSession.course_instance_id,
                delta_milli_dollars: deltaMilliDollars,
                credit_type: 'transferable',
                user_id: localSession.agent_user_id,
                reason: 'Credit purchase',
              });
              await updateAiGradingCreditCheckoutSessionData({
                stripe_object_id: stripeSessionId,
                data: session,
              });
            });
          }
        }
      }
      // Re-read to get the latest credits_added state after our transaction.
      const updatedSession =
        await getAiGradingCreditCheckoutSessionByStripeObjectId(stripeSessionId);
      checkoutStatus = updatedSession?.credits_added ? 'success' : null;
    } else if (canEdit && req.query.checkout === 'cancelled') {
      checkoutStatus = 'cancelled';
    }

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'AI grading',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'ai_grading',
        },
        content: (
          <Hydrate>
            <InstructorInstanceAdminAiGrading
              trpcCsrfToken={trpcCsrfToken}
              initialUseCustomApiKeys={courseInstance.ai_grading_use_custom_api_keys}
              initialApiKeyCredentials={credentials}
              canEdit={!!canEdit}
              isDevMode={config.devMode}
              aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
              stripePurchasingEnabled={stripePurchasingEnabled}
              initialCheckoutStatus={checkoutStatus}
              initialCheckoutAmountCents={checkoutAmountCents}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: aiGradingSettingsRouter,
    createContext,
    onError: handleTrpcError,
  }),
);

export default router;
