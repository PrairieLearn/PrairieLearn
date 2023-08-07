import express = require('express');
import asyncHandler = require('express-async-handler');

import { config } from '../../../lib/config';
import { getStripeClient } from '../../lib/billing/stripe';

const router = express.Router({ mergeParams: true });

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    if (!config.stripeWebhookSigningSecret) {
      throw new Error('Stripe is not configured.');
    }

    const stripe = getStripeClient();

    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'] as string,
      config.stripeWebhookSigningSecret,
    );

    console.log(event);

    res.json({ received: true });
  }),
);

export default router;
