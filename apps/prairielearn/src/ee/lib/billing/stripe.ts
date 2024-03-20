import Stripe from 'stripe';
import { loadSqlEquiv, queryAsync, runInTransactionAsync } from '@prairielearn/postgres';

import { cache } from '@prairielearn/cache';
import { config } from '../../../lib/config';
import { selectAndLockUserById, selectUserById } from '../../../models/user';
import { PlanName } from './plans-types';

const sql = loadSqlEquiv(__filename);

export function getStripeClient() {
  if (!config.stripeSecretKey) {
    throw new Error('Stripe is not configured.');
  }

  return new Stripe(config.stripeSecretKey, { apiVersion: '2023-10-16' });
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
    await queryAsync(sql.maybe_update_user_stripe_customer_id, {
      user_id,
      stripe_customer_id: customer.id,
    });
  });

  const updatedUser = await selectUserById(user_id);

  if (updatedUser.stripe_customer_id == null) {
    throw new Error('Failed to update user with Stripe customer ID');
  }

  return updatedUser.stripe_customer_id;
}

function stripeProductCacheKey(id: string): string {
  return `v1:stripe:product:${id}`;
}

/**
 * Gets the Stripe product with the given ID. Products are cached for up to
 * 10 minutes.
 */
export async function getStripeProduct(id: string): Promise<Stripe.Product> {
  const cacheKey = stripeProductCacheKey(id);
  let product: Stripe.Product = await cache.get(cacheKey);
  if (!product) {
    const stripe = getStripeClient();
    product = await stripe.products.retrieve(id, { expand: ['default_price'] });
    cache.set(cacheKey, product, 1000 * 60 * 10);
  }
  return product;
}

export async function clearStripeProductCache(id: string) {
  const cacheKey = stripeProductCacheKey(id);
  await cache.del(cacheKey);
}

export async function getDefaultPriceForStripeProduct(id: string): Promise<Stripe.Price> {
  const product = await getStripeProduct(id);

  // We instructed Stripe to expand the `default_price` field, so this should
  // always be set and be an object. We only support products with a default
  // price.
  if (!product.default_price || typeof product.default_price !== 'object') {
    throw new Error(`No default_price found for product ${id}`);
  }

  return product.default_price;
}

export async function getPriceForPlan(plan: PlanName): Promise<Stripe.Price> {
  const productId = config.stripeProductIds[plan];

  if (!productId) {
    throw new Error(`No product configured for plan ${plan}`);
  }

  return await getDefaultPriceForStripeProduct(productId);
}

/**
 * Fetches the prices for the given plans. The result is a map from plan name
 * to the price in cents.
 */
export async function getPricesForPlans(plans: PlanName[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  for (const plan of plans) {
    const price = await getPriceForPlan(plan);

    if (
      price.billing_scheme !== 'per_unit' ||
      price.unit_amount == null ||
      price.currency !== 'usd'
    ) {
      // We should never hit this in practice, because the prices should
      // always be `per_unit`, which in turn should guarantee that
      // `unit_amount` is set. We also only have logic for rendering USD
      // prices, so we'll fail fast if we get a price in a different currency.
      throw new Error(`Invalid unit_amount for price ${price.id}`);
    }

    prices[plan] = price.unit_amount;
  }
  return prices;
}

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatStripePrice(price: number) {
  return priceFormatter.format(price / 100);
}
