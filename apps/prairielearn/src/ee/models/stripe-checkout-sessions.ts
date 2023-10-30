import { loadSqlEquiv, queryAsync, queryOptionalRow, queryRow } from '@prairielearn/postgres';
import type Stripe from 'stripe';
import { PlanName } from '../lib/billing/plans-types';
import { type StripeCheckoutSession, StripeCheckoutSessionSchema } from '../../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function insertStripeCheckoutSessionForUserInCourseInstance({
  agent_user_id,
  stripe_object_id,
  institution_id,
  course_instance_id,
  subject_user_id,
  data,
  plan_names,
}: {
  agent_user_id: string;
  stripe_object_id: string;
  institution_id: string;
  course_instance_id: string;
  subject_user_id: string;
  data: any;
  plan_names: PlanName[];
}) {
  await queryAsync(sql.insert_stripe_checkout_session_for_user_in_course_instance, {
    agent_user_id,
    stripe_object_id,
    institution_id,
    course_instance_id,
    subject_user_id,
    data,
    plan_names,
  });
}

export async function getStripeCheckoutSessionByStripeObjectId(
  stripe_object_id: string,
): Promise<StripeCheckoutSession | null> {
  return await queryOptionalRow(
    sql.get_stripe_checkout_session_by_stripe_object_id,
    {
      stripe_object_id,
    },
    StripeCheckoutSessionSchema,
  );
}

/**
 * Marks a Stripe checkout session as completed. It's considered completed when
 * we've received payment and all plan grants have been created.
 *
 * @param stripe_object_id Stripe's ID for the checkout session object
 */
export async function markStripeCheckoutSessionCompleted(stripe_object_id: string) {
  await queryAsync(sql.mark_stripe_checkout_session_completed, {
    stripe_object_id,
  });
}

export async function updateStripeCheckoutSessionData({
  stripe_object_id,
  data,
}: {
  stripe_object_id: string;
  data: Stripe.Checkout.Session;
}): Promise<StripeCheckoutSession> {
  return await queryRow(
    sql.update_stripe_checkout_session_data,
    {
      stripe_object_id,
      data,
    },
    StripeCheckoutSessionSchema,
  );
}
