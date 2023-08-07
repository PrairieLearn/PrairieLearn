import express = require('express');
import asyncHandler = require('express-async-handler');
import Stripe from 'stripe';
import error = require('@prairielearn/error');

import { config } from '../../../lib/config';
import { getStripeClient } from '../../lib/billing/stripe';

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

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const event = constructEvent(req);

    console.log(event);

    if (event.type === 'checkout.session.completed') {
      // TODO: handle this
      const session = event.data.object as Stripe.Checkout.Session;

      // If the order is paid, ensure that plan grants are created. We may have
      // already done this in the success page for the session, so we need to
      // gracefully handle duplicate plan grants.
      if (session.payment_status === 'paid') {
        // TODO: ensure plan grants
      }
    } else if (event.type === 'checkout.session.async_payment_succeeded') {
      // TODO: handle this
    } else if (event.type === 'checkout.session.async_payment_failed') {
      // TODO: handle this
    }

    res.json({ received: true });
  }),
);

export default router;
