/**
 * Regular expression for validating short names, including course instance short names and QIDs.
 */
export const SHORT_NAME_REGEX = /^[-A-Za-z0-9_][-A-Za-z0-9_]*(\/[-A-Za-z0-9_][-A-Za-z0-9_]*)*$/;

/**
 * String pattern for short names, suitable for use in HTML pattern attributes.
 * Use this when you need a pattern string for client-side validation in forms.
 */
export const SHORT_NAME_PATTERN = '[-A-Za-z0-9_][-A-Za-z0-9_]*(\\/[-A-Za-z0-9_][-A-Za-z0-9_]*)*';

/**
 * Escaped string pattern for short names with capturing groups.
 * Use this when constructing regex objects from strings or when the pattern
 * will be embedded in another string context that requires escaped characters.
 */
export const ESCAPED_SHORT_NAME_PATTERN =
  '([\\-A-Za-z0-9_][\\-A-Za-z0-9_]*)(\\/[\\-A-Za-z0-9_][\\-A-Za-z0-9_]*)*';

/**
 * Validates whether a string is a valid short name using our short name regex.
 *
 * @param shortName - The string that we are validating.
 */
export function isValidShortName(shortName: string): boolean {
  return SHORT_NAME_REGEX.test(shortName);
}
