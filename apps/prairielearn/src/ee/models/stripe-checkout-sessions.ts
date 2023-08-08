import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';
import { PlanName } from '../lib/billing/plans-types';
import { StripeCheckoutSessionSchema } from '../../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function insertStripeCheckoutSessionForUserInCourseInstance({
  session_id,
  institution_id,
  course_instance_id,
  user_id,
  data,
  plan_names,
}: {
  session_id: string;
  institution_id: string;
  course_instance_id: string;
  user_id: string;
  data: any;
  plan_names: PlanName[];
}) {
  await queryAsync(sql.insert_stripe_checkout_session_for_user_in_course_instance, {
    session_id,
    institution_id,
    course_instance_id,
    user_id,
    data,
    plan_names,
  });
}

export async function getStripeCheckoutSessionBySessionId(session_id: string) {
  return await queryRow(
    sql.get_stripe_checkout_session_by_session_id,
    {
      session_id,
    },
    StripeCheckoutSessionSchema,
  );
}

/**
 * Marks a Stripe checkout session as completed. It's considered completed when
 * we've received payment and all plan grants have been created.
 *
 * @param session_id Stripe's ID for the checkout session
 */
export async function markStripeCheckoutSessionCompleted(session_id: string) {
  await queryAsync(sql.mark_stripe_checkout_session_completed, {
    session_id,
  });
}
