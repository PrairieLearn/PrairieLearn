import express = require('express');
import asyncHandler = require('express-async-handler');
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

    res.json({ received: true });
  }),
);

export default router;
