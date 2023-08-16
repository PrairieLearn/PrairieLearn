import Stripe from 'stripe';
import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';

import * as cache from '../../../lib/cache';
import { config } from '../../../lib/config';
import { selectAndLockUserById, selectUserById } from '../../../models/user';
import { PlanName } from './plans-types';
import { UserSchema } from '../../../lib/db-types';

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

  // We update the user in a transaction with a lock to ensure that we only
  // ever use one Stripe customer ID for each user. Note that we might create
  // multiple Stripe customers for the same user, but that's acceptable, as
  // the alternative would require locking during a network operation.
  await runInTransactionAsync(async () => {
    await selectAndLockUserById(user_id);
    await queryRow(
      sql.maybe_update_user_stripe_customer_id,
      {
        user_id,
        stripe_customer_id: customer.id,
      },
      UserSchema,
    );
  });

  const updatedUser = await selectUserById(user_id);

  if (updatedUser.stripe_customer_id == null) {
    throw new Error('Failed to update user with Stripe customer ID');
  }

  return updatedUser.stripe_customer_id;
}

/**
 * Returns the price in cents for the given plan.
 */
export async function getPriceForPlan(plan: PlanName): Promise<number> {
  const cacheKey = `stripe:price:${plan}`;
  let price: number = await cache.get(cacheKey);
  if (typeof price !== 'number') {
    const stripe = getStripeClient();
    const priceId = config.stripePriceIds[plan];
    if (!priceId) {
      throw new Error(`No price configured for plan ${plan}`);
    }
    const stripePrice = await stripe.prices.retrieve(priceId);

    if (
      stripePrice.billing_scheme !== 'per_unit' ||
      stripePrice.unit_amount == null ||
      stripePrice.currency !== 'usd'
    ) {
      // We should never hit this in practice, because the prices should
      // always be `per_unit`, which in turn should guarantee that
      // `unit_amount` is set. We also only have logic for rendering USD
      // prices, so we'll fail fast if we get a price in a different currency.
      throw new Error(`No unit_amount found for price ${priceId}`);
    }

    price = stripePrice.unit_amount;

    // Cache the result for up to one minute.
    cache.set(cacheKey, price, 1000 * 60);
  }
  return price;
}

/**
 * Fetches the prices for the given plans. The result is a map from plan name
 * to the price in cents.
 */
export async function getPricesForPlans(plans: PlanName[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  for (const plan of plans) {
    prices[plan] = await getPriceForPlan(plan);
  }
  return prices;
}
