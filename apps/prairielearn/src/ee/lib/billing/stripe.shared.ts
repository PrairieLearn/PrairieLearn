const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/**
 * Formats a price in cents to a USD currency string.
 */
export function formatStripePrice(price: number): string {
  return priceFormatter.format(price / 100);
}
