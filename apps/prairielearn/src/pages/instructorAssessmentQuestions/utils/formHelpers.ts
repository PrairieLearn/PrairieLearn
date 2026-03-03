/**
 * Converts a string value from an HTML input to a number or undefined.
 * Used as a `setValueAs` transform for react-hook-form number inputs.
 */
export const coerceToNumber = (v: string): number | undefined => (v === '' ? undefined : Number(v));

/**
 * Parses a points list input value into a number, array of numbers, or string.
 * Used as a `setValueAs` transform for points list inputs that accept
 * comma-separated values (e.g. "10, 5, 2, 1").
 */
export function parsePointsListValue(v: string): number | number[] | string | undefined {
  if (v === '') return undefined;
  if (!Number.isNaN(Number(v))) return Number(v);
  if (v.includes(',')) {
    return v
      .split(',')
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => !Number.isNaN(n));
  }
  return v;
}

/**
 * Validates that at least one points field (auto points or manual points) is set.
 * Returns an error message if all are undefined, or undefined if valid.
 */
export function validateAtLeastOnePointsField(values: {
  autoPoints?: number | number[];
  points?: number | number[];
  manualPoints?: number;
}): string | undefined {
  if (
    values.points === undefined &&
    values.autoPoints === undefined &&
    values.manualPoints === undefined
  ) {
    return 'At least one of auto points or manual points must be set.';
  }
}

/**
 * Extracts a string comment from a value that may be a string or other type.
 * Returns the comment if it's a string, or undefined otherwise.
 */
export function extractStringComment(comment: unknown): string | undefined {
  return typeof comment === 'string' ? comment : undefined;
}
