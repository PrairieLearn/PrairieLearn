/**
 * Regular expression for validating short names, including course instance short names and QIDs.
 */
export const SHORT_NAME_REGEX = /^[-A-Za-z0-9_][-A-Za-z0-9_]*(\/[-A-Za-z0-9_][-A-Za-z0-9_]*)*$/;

/**
 * String pattern for short names, suitable for use in HTML pattern attributes.
 * Derived from SHORT_NAME_REGEX to maintain a single source of truth.
 */
export const SHORT_NAME_PATTERN = SHORT_NAME_REGEX.source;

/**
 * Validates whether a string is a valid short name using our short name regex.
 *
 * @param shortName - The string that we are validating.
 */
export function isValidShortName(shortName: string): boolean {
  return SHORT_NAME_REGEX.test(shortName);
}
