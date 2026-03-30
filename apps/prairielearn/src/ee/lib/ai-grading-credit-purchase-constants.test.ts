import { describe, expect, it } from 'vitest';

import { calculateCreditPurchaseCharge } from './ai-grading-credit-purchase-constants.js';

// These tests pin the rounding behavior when converting milli-dollars to Stripe
// cents.
describe('calculateCreditPurchaseCharge', () => {
  it('rounds up to the next cent for a non-cent-aligned purchase', () => {
    const result = calculateCreditPurchaseCharge({
      amount_milli_dollars: 1001,
    });

    expect(result.stripe_amount_cents).toBe(101);
    expect(result.charged_milli_dollars).toBe(1010);
  });

  it('matches exact amount when already cent-aligned', () => {
    const result = calculateCreditPurchaseCharge({
      amount_milli_dollars: 1000,
    });

    expect(result.stripe_amount_cents).toBe(100);
    expect(result.charged_milli_dollars).toBe(1000);
  });
});
