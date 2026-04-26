/**
 * Minimum and maximum milli-dollar amounts enforced for admin credit pool
 * adjustments. Applied on both the client (input validation) and server
 * (trpc handler). Stored in milli-dollars to match the DB and display helpers.
 */
export interface CreditPoolLimits {
  add: { minMilliDollars: number; maxMilliDollars: number };
  deduct: { minMilliDollars: number; maxMilliDollars: number };
  setTransferable: { minMilliDollars: number; maxMilliDollars: number };
  setNonTransferable: { minMilliDollars: number; maxMilliDollars: number };
}

/**
 * Format milli-dollars as a display string.
 * Examples: 4509 → "$4.51", 0 → "$0.00", 5 → "<$0.01", -4509 → "-$4.51"
 */
export function formatMilliDollars(milliDollars: number): string {
  const abs = Math.abs(milliDollars);
  const sign = milliDollars < 0 ? '-' : '';
  if (abs > 0 && abs < 10) {
    return `${sign}<$0.01`;
  }
  const dollars = abs / 1000;
  return `${sign}$${dollars.toFixed(2)}`;
}

/**
 * Convert raw API cost in dollars to milli-dollars with an infrastructure fee markup.
 *
 * @param rawCostDollars - The raw API cost in US dollars (e.g. 0.0045)
 * @param feeDecimal - The infrastructure fee as a decimal (e.g. 0.2 for 20%)
 * @returns The total cost in milli-dollars, rounded to the nearest milli-dollar
 */
export function calculateCostWithFeeMilliDollars(
  rawCostDollars: number,
  feeDecimal: number,
): number {
  const totalDollars = rawCostDollars * (1 + feeDecimal);
  return Math.ceil(totalDollars * 1000);
}
