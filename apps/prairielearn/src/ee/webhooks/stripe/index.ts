import express = require('express');
import asyncHandler = require('express-async-handler');
import Stripe from 'stripe';
import error = require('@prairielearn/error');

import { config } from '../../../lib/config';
import { getStripeClient } from '../../lib/billing/stripe';
import {
  getStripeCheckoutSessionByStripeObjectId,
  markStripeCheckoutSessionCompleted,
} from '../../models/stripe-checkout-sessions';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { ensurePlanGrant } from '../../models/plan-grants';

const router = express.Router({ mergeParams: true });

function constructEvent(req: express.Request) {
  if (!config.stripeWebhookSigningSecret) {
    throw new Error('Stripe is not configured.');
  }

  const stripe = getStripeClient();
  try {
    return stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'] as string,
      config.stripeWebhookSigningSecret,
    );
  } catch (err) {
    throw error.make(400, `Webhook error: ${err.message}`);
  }
}

async function handleSessionUpdate(session: Stripe.Checkout.Session) {
  // If the order is paid, ensure that plan grants are created. We may have
  // already done this in the success page for the session, so we need to
  // gracefully handle duplicate plan grants.
  if (session.payment_status === 'paid') {
    const localSession = await getStripeCheckoutSessionByStripeObjectId(session.id);

    if (!localSession) {
      // We got a webhook for a session that we don't know about. It was likely
      // created by a different PrairieLearn instance, so we can safely ignore.
      return;
    }

    if (localSession.plan_grants_created) {
      // We already handled the results from this session, so we don't have to
      // do anything else.
      return;
    }

    const institution_id = localSession.institution_id;
    const course_instance_id = localSession.course_instance_id;

    if (!institution_id) {
      throw new Error('Stripe checkout session missing institution_id');
    }

    if (!course_instance_id) {
      throw new Error('Stripe checkout session missing course_instance_id');
    }

    await runInTransactionAsync(async () => {
      for (const planName of localSession.plan_names) {
        await ensurePlanGrant({
          plan_grant: {
            plan_name: planName,
            type: 'stripe',
            institution_id: institution_id,
            course_instance_id: course_instance_id,
            user_id: localSession.user_id,
          },
          authn_user_id: localSession.user_id,
        });
      }

      await markStripeCheckoutSessionCompleted(session.id);
    });
  }
}

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const event = constructEvent(req);

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleSessionUpdate(session);
    }

    res.json({ received: true });
  }),
);

export default router;
