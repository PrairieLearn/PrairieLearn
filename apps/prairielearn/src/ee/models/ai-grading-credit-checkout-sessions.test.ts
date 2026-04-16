import type Stripe from 'stripe';
import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest';
import { z } from 'zod';

import { queryRows } from '@prairielearn/postgres';

import { adjustCreditPool, selectCreditPool } from '../../models/ai-grading-credit-pool.js';
import * as helperCourse from '../../tests/helperCourse.js';
import * as helperDb from '../../tests/helperDb.js';
import { getOrCreateUser } from '../../tests/utils/auth.js';
import * as stripeLib from '../lib/billing/stripe.js';

import {
  getCreditCheckoutSessionByStripeId,
  insertCreditCheckoutSession,
  processCreditPurchase,
  refundCreditPurchase,
} from './ai-grading-credit-checkout-sessions.js';

const COURSE_INSTANCE_ID = '1';

const CreditPoolChangeForCheckoutSchema = z.object({
  id: z.coerce.string(),
  delta_milli_dollars: z.coerce.number(),
  reason: z.string(),
  checkout_session_id: z.coerce.string().nullable(),
});

async function selectChangesForCheckoutSession(checkout_session_id: string) {
  return await queryRows(
    `SELECT
       id,
       delta_milli_dollars,
       reason,
       checkout_session_id
     FROM ai_grading_credit_pool_changes
     WHERE checkout_session_id = $checkout_session_id
     ORDER BY id ASC`,
    { checkout_session_id },
    CreditPoolChangeForCheckoutSchema,
  );
}

async function createTestUser() {
  const user = await getOrCreateUser({
    uid: 'credit-checkout-user@example.com',
    name: 'Credit Checkout User',
    uin: 'creditcheckout',
    email: 'credit-checkout-user@example.com',
  });
  return user.id;
}

function makeStripeSession(stripeObjectId: string): Stripe.Checkout.Session {
  return {
    id: stripeObjectId,
    object: 'checkout.session',
    payment_intent: `pi_${stripeObjectId}`,
  } as Stripe.Checkout.Session;
}

describe('ai-grading-credit-checkout-sessions', () => {
  beforeEach(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await helperDb.after();
  });

  it('processCreditPurchase is idempotent for the same Stripe session', async () => {
    const userId = await createTestUser();
    const stripeObjectId = 'cs_purchase_idempotent';
    const purchaseAmountMilliDollars = 2500;

    await insertCreditCheckoutSession({
      agent_user_id: userId,
      stripe_object_id: stripeObjectId,
      course_instance_id: COURSE_INSTANCE_ID,
      data: makeStripeSession(stripeObjectId),
      amount_milli_dollars: purchaseAmountMilliDollars,
    });

    const localSession = await getCreditCheckoutSessionByStripeId(stripeObjectId);
    assert.isNotNull(localSession);

    const poolBefore = await selectCreditPool(COURSE_INSTANCE_ID);

    await processCreditPurchase({
      localSession,
      stripeSession: makeStripeSession(stripeObjectId),
    });
    await processCreditPurchase({
      localSession,
      stripeSession: makeStripeSession(stripeObjectId),
    });

    const poolAfter = await selectCreditPool(COURSE_INSTANCE_ID);
    assert.equal(
      poolAfter.credit_transferable_milli_dollars,
      poolBefore.credit_transferable_milli_dollars + purchaseAmountMilliDollars,
    );

    const updatedSession = await getCreditCheckoutSessionByStripeId(stripeObjectId);
    assert.isNotNull(updatedSession);
    assert.isTrue(updatedSession.credits_added);

    const changes = await selectChangesForCheckoutSession(localSession.id);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].delta_milli_dollars, purchaseAmountMilliDollars);
    assert.equal(changes[0].reason, 'Credit purchase');
  });

  it('refundCreditPurchase caps deduction by currently available transferable balance', async () => {
    const userId = await createTestUser();
    const stripeObjectId = 'cs_refund_capped';
    const purchaseAmountMilliDollars = 3000;

    await insertCreditCheckoutSession({
      agent_user_id: userId,
      stripe_object_id: stripeObjectId,
      course_instance_id: COURSE_INSTANCE_ID,
      data: makeStripeSession(stripeObjectId),
      amount_milli_dollars: purchaseAmountMilliDollars,
    });

    const localSession = await getCreditCheckoutSessionByStripeId(stripeObjectId);
    assert.isNotNull(localSession);

    await processCreditPurchase({
      localSession,
      stripeSession: makeStripeSession(stripeObjectId),
    });

    const poolAfterPurchase = await selectCreditPool(COURSE_INSTANCE_ID);
    const remainingTransferableBeforeRefund = 500;
    await adjustCreditPool({
      course_instance_id: COURSE_INSTANCE_ID,
      delta_milli_dollars:
        remainingTransferableBeforeRefund - poolAfterPurchase.credit_transferable_milli_dollars,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Test spend before refund',
    });

    const poolBeforeRefund = await selectCreditPool(COURSE_INSTANCE_ID);
    assert.equal(
      poolBeforeRefund.credit_transferable_milli_dollars,
      remainingTransferableBeforeRefund,
    );

    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_test' });
    vi.spyOn(stripeLib, 'getStripeClient').mockReturnValue({
      refunds: { create: refundsCreate },
    } as unknown as Stripe);

    await refundCreditPurchase({
      checkout_session_id: localSession.id,
      course_instance_id: COURSE_INSTANCE_ID,
      admin_user_id: userId,
    });

    assert.equal(refundsCreate.mock.calls.length, 1);

    const poolAfterRefund = await selectCreditPool(COURSE_INSTANCE_ID);
    assert.equal(poolAfterRefund.credit_transferable_milli_dollars, 0);

    const refundedSession = await getCreditCheckoutSessionByStripeId(stripeObjectId);
    assert.isNotNull(refundedSession);
    assert.isNotNull(refundedSession.refunded_at);

    const changes = await selectChangesForCheckoutSession(localSession.id);
    assert.equal(changes.length, 2);
    assert.equal(changes[0].delta_milli_dollars, purchaseAmountMilliDollars);
    assert.equal(changes[0].reason, 'Credit purchase');
    assert.equal(changes[1].delta_milli_dollars, -remainingTransferableBeforeRefund);
    assert.equal(changes[1].reason, 'Credit purchase refund');
  });
});
