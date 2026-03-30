import { describe, expect, it } from 'vitest';

import { calculateCreditPurchaseCharge } from './ai-grading-credit-purchase-constants.js';

describe('calculateCreditPurchaseCharge', () => {
  it('derives fee from charged cents for a non-cent-aligned purchase', () => {
    const result = calculateCreditPurchaseCharge({
      amount_milli_dollars: 1001,
      infrastructure_fee_rate: 0.2,
    });

    expect(result.stripe_amount_cents).toBe(121);
    expect(result.charged_milli_dollars).toBe(1210);
    expect(result.infrastructure_fee_milli_dollars).toBe(209);
    expect(result.infrastructure_fee_milli_dollars + 1001).toBe(result.charged_milli_dollars);
  });

  it('matches exact fee math when the total is already cent-aligned', () => {
    const result = calculateCreditPurchaseCharge({
      amount_milli_dollars: 1000,
      infrastructure_fee_rate: 0.2,
    });

    expect(result.stripe_amount_cents).toBe(120);
    expect(result.charged_milli_dollars).toBe(1200);
    expect(result.infrastructure_fee_milli_dollars).toBe(200);
    expect(result.infrastructure_fee_milli_dollars + 1000).toBe(result.charged_milli_dollars);
  });
});
