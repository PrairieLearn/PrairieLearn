import type Stripe from 'stripe';

import { type KeyRing, getKeyRing } from '../../../lib/key-ring.js';

export function constructStripeEventWithKeyRing({
  stripe,
  payload,
  signature,
  signingSecrets,
}: {
  stripe: Stripe;
  payload: Buffer;
  signature: string;
  signingSecrets: KeyRing;
}): Stripe.Event {
  const results = getKeyRing(signingSecrets).map((secret) => {
    try {
      return { event: stripe.webhooks.constructEvent(payload, signature, secret) };
    } catch (error) {
      return { error };
    }
  });
  const successfulResult = results.find((result) => result.event !== undefined);
  if (successfulResult?.event) {
    return successfulResult.event;
  }
  throw results[0].error;
}
