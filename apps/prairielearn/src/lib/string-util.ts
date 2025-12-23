/**
 * Utility functions for working with / parsing strings in various ways.
 */
import { HttpStatusError } from '@prairielearn/error';

/**
 * Parses a string of values separated by commas, whitespace, line breaks, or semicolons
 * into an array of unique values.
 *
 * @param valuesString The string of values to parse.
 * @param limit The maximum number of values to accept without throwing an error.
 */
export function parseUniqueValuesFromString(valuesString: string, limit = 1000): string[] {
  const values = new Set(
    valuesString
      .split(/[\s,;]+/)
      .map((uid) => uid.trim())
      .filter(Boolean),
  );

  if (values.size > limit) {
    throw new HttpStatusError(400, `Cannot provide more than ${limit} values at a time`);
  }

  return Array.from(values);
}
