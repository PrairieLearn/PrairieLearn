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
import { adjustCreditPool } from '../../models/ai-grading-credit-pool.js';
import { insertAuditEvent } from '../../models/audit-event.js';

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

/**
 * Marks a checkout session as completed. Uses `credits_added = FALSE` guard
 * to ensure only one caller succeeds; returns whether this call claimed it.
 */
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
    const claimed = await markCheckoutSessionCompleted(stripeSession.id);
    if (!claimed) return;

    await adjustCreditPool({
      course_instance_id: localSession.course_instance_id,
      delta_milli_dollars: localSession.amount_milli_dollars,
      credit_type: 'transferable',
      user_id: localSession.agent_user_id,
      reason: 'Credit purchase',
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
