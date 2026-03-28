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
 * Convert raw API cost in dollars to milli-dollars.
 *
 * @param rawCostDollars - The raw API cost in US dollars (e.g. 0.0045)
 * @returns The cost in milli-dollars, rounded up to the nearest milli-dollar
 */
export function calculateCostMilliDollars(rawCostDollars: number): number {
  return Math.ceil(rawCostDollars * 1000);
}
