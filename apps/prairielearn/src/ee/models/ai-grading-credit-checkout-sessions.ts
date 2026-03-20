import type Stripe from 'stripe';

import { execute, loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import {
  type AiGradingCreditCheckoutSession,
  AiGradingCreditCheckoutSessionSchema,
} from '../../lib/db-types.js';

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

export async function markAiGradingCreditCheckoutSessionCompleted(stripe_object_id: string) {
  await execute(sql.mark_ai_grading_credit_checkout_session_completed, {
    stripe_object_id,
  });
}

export async function updateAiGradingCreditCheckoutSessionData({
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
