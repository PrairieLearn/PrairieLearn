/**
 * Validation patterns and utilities for short names (course instance IDs and question IDs).
 */

export const SHORT_NAME_REGEX = /^[-A-Za-z0-9_][-A-Za-z0-9_.]*(\/[-A-Za-z0-9_][-A-Za-z0-9_.]*)*$/;

export const SHORT_NAME_PATTERN = '[-A-Za-z0-9_][-A-Za-z0-9_.]*(\\/[-A-Za-z0-9_][-A-Za-z0-9_.]*)*';

export function isValidShortName(shortName: string): boolean {
  return SHORT_NAME_REGEX.test(shortName);
}
