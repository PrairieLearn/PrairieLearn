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
