import Stripe from 'stripe';

import { config } from '../../../lib/config';

export function getStripeClient() {
  if (!config.stripeSecretKey) {
    throw new Error('Stripe is not configured.');
  }

  return new Stripe(config.stripeSecretKey, { apiVersion: '2022-11-15' });
}
