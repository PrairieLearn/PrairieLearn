import type Stripe from 'stripe';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type AiGradingCreditCheckoutSession,
  AiGradingCreditCheckoutSessionSchema,
} from '../../lib/db-types.js';
import {
  adjustCreditPool,
  selectCreditPoolForUpdate,
} from '../../models/ai-grading-credit-pool.js';
import { insertAuditEvent } from '../../models/audit-event.js';
import { getStripeClient } from '../lib/billing/stripe.js';

const sql = loadSqlEquiv(import.meta.url);

export async function insertCreditCheckoutSession({
  agent_user_id,
  stripe_object_id,
  course_instance_id,
  data,
  amount_milli_dollars,
}: {
  agent_user_id: string;
  stripe_object_id: string;
  course_instance_id: string;
  data: Stripe.Checkout.Session;
  amount_milli_dollars: number;
}) {
  await execute(sql.insert_ai_grading_credit_checkout_session, {
    agent_user_id,
    stripe_object_id,
    course_instance_id,
    data,
    amount_milli_dollars,
  });
}

export async function getCreditCheckoutSessionByStripeId(
  stripe_object_id: string,
): Promise<AiGradingCreditCheckoutSession | null> {
  return await queryOptionalRow(
    sql.get_ai_grading_credit_checkout_session_by_stripe_object_id,
    { stripe_object_id },
    AiGradingCreditCheckoutSessionSchema,
  );
}

async function markCheckoutSessionCompleted(stripe_object_id: string): Promise<boolean> {
  const result = await queryOptionalRow(
    sql.mark_ai_grading_credit_checkout_session_completed,
    { stripe_object_id },
    AiGradingCreditCheckoutSessionSchema,
  );
  return result !== null;
}

async function updateCheckoutSessionData({
  stripe_object_id,
  data,
}: {
  stripe_object_id: string;
  data: Stripe.Checkout.Session;
}): Promise<AiGradingCreditCheckoutSession> {
  return await queryRow(
    sql.update_ai_grading_credit_checkout_session_data,
    {
      stripe_object_id,
      data,
    },
    AiGradingCreditCheckoutSessionSchema,
  );
}

/**
 * Processes a paid Stripe checkout session: marks it completed, adds credits
 * to the pool, and inserts an audit event — all in a single transaction.
 */
export async function processCreditPurchase({
  localSession,
  stripeSession,
}: {
  localSession: AiGradingCreditCheckoutSession;
  stripeSession: Stripe.Checkout.Session;
}): Promise<void> {
  await runInTransactionAsync(async () => {
    /*
     * Deadlock risk here is specific to checkout-session processing vs.
     * course-instance deletion. In purchase/refund handling, we update
     * ai_grading_credit_checkout_sessions (child) and then lock
     * course_instances FOR UPDATE (parent) when adjusting credits. But deleting
     * a course instance locks course_instances first and then cascades to
     * ai_grading_credit_checkout_sessions. We lock the parent first here so our
     * lock order matches the delete flow and avoids a child->parent /
     * parent->child deadlock cycle.
     */
    await selectCreditPoolForUpdate(localSession.course_instance_id);

    const claimed = await markCheckoutSessionCompleted(stripeSession.id);
    if (!claimed) return;

    await adjustCreditPool({
      course_instance_id: localSession.course_instance_id,
      delta_milli_dollars: localSession.amount_milli_dollars,
      credit_type: 'transferable',
      user_id: localSession.agent_user_id,
      reason: 'Credit purchase',
      checkout_session_id: localSession.id,
    });

    await updateCheckoutSessionData({
      stripe_object_id: stripeSession.id,
      data: stripeSession,
    });

    await insertAuditEvent({
      tableName: 'ai_grading_credit_checkout_sessions',
      action: 'insert',
      rowId: localSession.id,
      agentAuthnUserId: localSession.agent_user_id,
      agentUserId: localSession.agent_user_id,
      courseInstanceId: localSession.course_instance_id,
      newRow: {
        amount_milli_dollars: localSession.amount_milli_dollars,
        course_instance_id: localSession.course_instance_id,
        agent_user_id: localSession.agent_user_id,
        stripe_object_id: stripeSession.id,
      },
    });
  });
}

/**
 * Refunds a completed credit purchase: issues a Stripe refund first, then
 * deducts credits from the transferable pool, marks the checkout session as
 * refunded, and inserts an audit event — all in a single transaction.
 *
 * Stripe is called before the DB commit so that a Stripe failure does not
 * leave the database in an inconsistent "refunded" state.
 */
export async function refundCreditPurchase({
  checkout_session_id,
  course_instance_id,
  admin_user_id,
}: {
  checkout_session_id: string;
  course_instance_id: string;
  admin_user_id: string;
}): Promise<void> {
  const session = await queryRow(
    sql.get_ai_grading_credit_checkout_session_by_id,
    { id: checkout_session_id },
    AiGradingCreditCheckoutSessionSchema,
  );

  if (session.course_instance_id !== course_instance_id) {
    throw new Error('Checkout session does not belong to this course instance');
  }

  if (!session.credits_added) {
    throw new Error('Cannot refund a purchase that has not been completed');
  }

  if (session.refunded_at != null) {
    throw new Error('This purchase has already been refunded');
  }

  // Resolve the payment intent ID before doing anything destructive.
  const paymentIntent = session.data.payment_intent;
  if (!paymentIntent) {
    throw new Error('Cannot refund: checkout session has no payment intent');
  }
  const paymentIntentId =
    typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent as { id: string }).id;

  // Issue Stripe refund with an idempotency key derived from the checkout
  // session so that retries (e.g. after a DB failure) do not create duplicate
  // refunds.  Stripe is called before the DB commit so that a Stripe failure
  // does not leave the database in an inconsistent "refunded" state.
  const stripe = getStripeClient();
  const idempotencyKey = `refund_checkout_session_${checkout_session_id}`;
  await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey });

  await runInTransactionAsync(async () => {
    // Same lock-order rule as processCreditPurchase (course_instance first,
    // checkout_session second) to avoid the parent/child lock inversion cycle
    // with concurrent course_instance delete/cascade operations.
    const pool = await selectCreditPoolForUpdate(session.course_instance_id);

    const marked = await queryOptionalRow(
      sql.mark_ai_grading_credit_checkout_session_refunded,
      { id: checkout_session_id },
      AiGradingCreditCheckoutSessionSchema,
    );
    if (!marked) {
      throw new Error('Failed to mark checkout session as refunded (already refunded)');
    }

    // Cap the deduction at the available transferable balance so it never goes negative.
    const deductAmount = Math.min(
      session.amount_milli_dollars,
      pool.credit_transferable_milli_dollars,
    );

    if (deductAmount > 0) {
      await adjustCreditPool({
        course_instance_id: session.course_instance_id,
        delta_milli_dollars: -deductAmount,
        credit_type: 'transferable',
        user_id: admin_user_id,
        reason: 'Credit purchase refund',
        checkout_session_id: session.id,
      });
    }

    await insertAuditEvent({
      tableName: 'ai_grading_credit_checkout_sessions',
      action: 'update',
      actionDetail: 'refund',
      rowId: session.id,
      agentAuthnUserId: admin_user_id,
      agentUserId: admin_user_id,
      courseInstanceId: session.course_instance_id,
      oldRow: {
        refunded_at: null,
        amount_milli_dollars: session.amount_milli_dollars,
      },
      newRow: {
        refunded_at: new Date().toISOString(),
        amount_milli_dollars: session.amount_milli_dollars,
      },
    });
  });
}
