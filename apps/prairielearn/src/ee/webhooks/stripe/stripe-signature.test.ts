import Stripe from 'stripe';
import { assert, describe, it } from 'vitest';

import { constructStripeEventWithKeyRing } from './stripe-signature.js';

const ACTIVE_SECRET = 'whsec_active';
const OLD_SECRET = 'whsec_old';
const PAYLOAD = JSON.stringify({
  id: 'evt_test',
  object: 'event',
  type: 'checkout.session.completed',
});
const stripe = new Stripe('sk_test_key');

function makeSignature(secret: string) {
  return stripe.webhooks.generateTestHeaderString({ payload: PAYLOAD, secret });
}

describe('constructStripeEventWithKeyRing', () => {
  it('continues to verify with a scalar secret', () => {
    const event = constructStripeEventWithKeyRing({
      stripe,
      payload: Buffer.from(PAYLOAD),
      signature: makeSignature(ACTIVE_SECRET),
      signingSecrets: ACTIVE_SECRET,
    });

    assert.equal(event.id, 'evt_test');
  });

  it('verifies with a fallback secret', () => {
    const event = constructStripeEventWithKeyRing({
      stripe,
      payload: Buffer.from(PAYLOAD),
      signature: makeSignature(OLD_SECRET),
      signingSecrets: [ACTIVE_SECRET, OLD_SECRET],
    });

    assert.equal(event.id, 'evt_test');
  });

  it('fails when no secret matches', () => {
    assert.throws(() =>
      constructStripeEventWithKeyRing({
        stripe,
        payload: Buffer.from(PAYLOAD),
        signature: makeSignature(OLD_SECRET),
        signingSecrets: [ACTIVE_SECRET, 'whsec_another'],
      }),
    );
  });
});
