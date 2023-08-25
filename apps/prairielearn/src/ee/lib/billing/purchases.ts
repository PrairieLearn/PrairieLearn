import { z } from 'zod';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import {
  CourseInstanceSchema,
  CourseSchema,
  StripeCheckoutSessionSchema,
} from '../../../lib/db-types';

const sql = loadSqlEquiv(__filename);

/**
 * A `Purchase` contains a Stripe checkout session and possible the course and
 * course instance that the purchase is associated with. This is used to display
 * information about purchases on the user settings page.
 */
export const PurchaseSchema = z.object({
  stripe_checkout_session: StripeCheckoutSessionSchema,
  course_instance: CourseInstanceSchema.nullable(),
  course: CourseSchema.nullable(),
});
export type Purchase = z.infer<typeof PurchaseSchema>;

export async function getPurchasesForUser(user_id: string) {
  // Get all purchases for this user.
  const allPurchases = await queryRows(sql.select_purchases, { user_id }, PurchaseSchema);

  // Only show completed checkout Sessions. If the user clicks through to
  // Stripe but never actually fills in their payment info and completes
  // the checkout, we'll still have a session in the database but we don't
  // want to show it to the user.
  //
  // Note that the status we check for here is independent of if the payment
  // has actually come through; that's stored in the `payment_status` field.
  const completedPurchases = allPurchases.filter(
    (purchase) => purchase.stripe_checkout_session.data.status === 'complete',
  );

  return completedPurchases;
}
