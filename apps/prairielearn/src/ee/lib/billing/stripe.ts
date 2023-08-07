import Stripe from 'stripe';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { config } from '../../../lib/config';
import { selectUserById } from '../../../models/user';

const sql = loadSqlEquiv(__filename);

export function getStripeClient() {
  if (!config.stripeSecretKey) {
    throw new Error('Stripe is not configured.');
  }

  return new Stripe(config.stripeSecretKey, { apiVersion: '2022-11-15' });
}

export async function getOrCreateStripeCustomerId(
  user_id: string,
  { name }: { name: string | null },
): Promise<string> {
  const user = await selectUserById(user_id);
  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: name ?? undefined,
    metadata: {
      prairielearn_user_id: user_id,
    },
  });

  await queryAsync(sql.update_user_stripe_customer_id, {
    user_id,
    stripe_customer_id: customer.id,
  });

  return customer.id;
}
