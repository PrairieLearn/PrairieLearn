/**
 * Rounds points in such a way that we can try to avoid accumulated floating
 * point errors. Specifically, we format the number to a string with 6 decimal
 * places and then re-parse it as a number. This ensures that values like
 * `0.30000000000000004` become `0.3` and `3.9999999999999996` become `4`.
 *
 * See {@link https://github.com/PrairieLearn/PrairieLearn/issues/10928} for more context.
 */
export function roundPoints(points: number): number {
  return Number.parseFloat(points.toFixed(6));
}
