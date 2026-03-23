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

export async function insertAiGradingCreditCheckoutSession({
  agent_user_id,
  stripe_object_id,
  course_instance_id,
  data,
  amount_cents,
}: {
  agent_user_id: string;
  stripe_object_id: string;
  course_instance_id: string;
  data: any;
  amount_cents: number;
}) {
  await execute(sql.insert_ai_grading_credit_checkout_session, {
    agent_user_id,
    stripe_object_id,
    course_instance_id,
    data,
    amount_cents,
  });
}

export async function getAiGradingCreditCheckoutSessionByStripeObjectId(
  stripe_object_id: string,
): Promise<AiGradingCreditCheckoutSession | null> {
  return await queryOptionalRow(
    sql.get_ai_grading_credit_checkout_session_by_stripe_object_id,
    { stripe_object_id },
    AiGradingCreditCheckoutSessionSchema,
  );
}

/**
 * Atomically marks a checkout session as completed. Returns `true` if the
 * session was marked (i.e. it had not been completed yet), `false` otherwise.
 * Callers should only credit the pool when this returns `true`.
 */
async function markAiGradingCreditCheckoutSessionCompleted(
  stripe_object_id: string,
): Promise<boolean> {
  const result = await queryOptionalRow(
    sql.mark_ai_grading_credit_checkout_session_completed,
    { stripe_object_id },
    AiGradingCreditCheckoutSessionSchema,
  );
  return result !== null;
}

async function updateAiGradingCreditCheckoutSessionData({
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
 * Processes a completed Stripe checkout session for AI grading credits.
 * Atomically marks the session as completed, adjusts the credit pool,
 * updates session data, and inserts an audit event — all within a single
 * transaction to prevent double-crediting and ensure auditability.
 */
export async function processAiGradingCreditPurchase({
  localSession,
  stripeSession,
}: {
  localSession: AiGradingCreditCheckoutSession;
  stripeSession: Stripe.Checkout.Session;
}): Promise<void> {
  const deltaMilliDollars = localSession.amount_cents * 10;

  await runInTransactionAsync(async () => {
    const claimed = await markAiGradingCreditCheckoutSessionCompleted(stripeSession.id);
    if (!claimed) return;

    await adjustCreditPool({
      course_instance_id: localSession.course_instance_id,
      delta_milli_dollars: deltaMilliDollars,
      credit_type: 'transferable',
      user_id: localSession.agent_user_id,
      reason: 'Credit purchase',
    });

    await updateAiGradingCreditCheckoutSessionData({
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
        amount_cents: localSession.amount_cents,
        course_instance_id: localSession.course_instance_id,
        agent_user_id: localSession.agent_user_id,
        stripe_object_id: stripeSession.id,
      },
    });
  });
}
