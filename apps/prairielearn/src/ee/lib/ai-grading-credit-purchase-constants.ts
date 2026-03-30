/** Minimum credit purchase amount in milli-dollars ($1.00). */
export const MIN_PURCHASE_MILLI_DOLLARS = 1_000;

/** Maximum credit purchase amount in milli-dollars ($10,000.00). */
export const MAX_PURCHASE_MILLI_DOLLARS = 10_000_000;

/** Approximate cost per AI-graded submission in dollars, used for UI estimates. */
export const APPROX_COST_PER_SUBMISSION_DOLLARS = 0.03;

/** Pre-defined credit purchase packages shown in the purchase modal. */
export const CREDIT_PACKAGES = [
  { dollars: 10, tagline: 'Best for testing AI grading' },
  { dollars: 25, tagline: 'Best for small courses' },
  { dollars: 100, tagline: 'Best for large courses' },
] as const;

/**
 * Calculates Stripe charge values for a credit purchase.
 *
 * Stripe charges in whole cents, so we round up to avoid under-charging and
 * then derive persisted milli-dollar values from the charged cent amount.
 */
export function calculateCreditPurchaseCharge({
  amount_milli_dollars,
  infrastructure_fee_rate,
}: {
  amount_milli_dollars: number;
  infrastructure_fee_rate: number;
}): {
  stripe_amount_cents: number;
  charged_milli_dollars: number;
  infrastructure_fee_milli_dollars: number;
} {
  const stripe_amount_cents = Math.ceil(
    (amount_milli_dollars * (1 + infrastructure_fee_rate)) / 10,
  );
  const charged_milli_dollars = stripe_amount_cents * 10;
  const infrastructure_fee_milli_dollars = charged_milli_dollars - amount_milli_dollars;

  return {
    stripe_amount_cents,
    charged_milli_dollars,
    infrastructure_fee_milli_dollars,
  };
}
