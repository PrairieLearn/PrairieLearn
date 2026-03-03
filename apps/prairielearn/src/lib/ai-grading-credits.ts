/**
 * Format milli-dollars as a display string.
 * Examples: 4509 → "$4.51", 0 → "$0.00", 5 → "less than $0.01"
 */
export function formatMilliDollars(milliDollars: number): string {
  if (milliDollars > 0 && milliDollars < 10) {
    return 'less than $0.01';
  }
  const dollars = milliDollars / 1000;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Convert raw API cost in dollars to milli-dollars with an infrastructure fee markup.
 *
 * @param rawCostDollars - The raw API cost in US dollars (e.g. 0.0045)
 * @param feePercent - The infrastructure fee percentage (e.g. 20 for 20%)
 * @returns The total cost in milli-dollars, rounded up to the nearest milli-dollar
 */
export function calculateCostWithFeeMilliDollars(
  rawCostDollars: number,
  feePercent: number,
): number {
  const totalDollars = rawCostDollars * (1 + feePercent / 100);
  return Math.ceil(totalDollars * 1000);
}
