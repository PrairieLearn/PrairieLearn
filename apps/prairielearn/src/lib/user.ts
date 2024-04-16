import { HttpStatusError } from '@prairielearn/error';

/**
 * Parses a string of UIDs separated by commas, whitespace, line breaks, or semicolons
 * into an array of unique UIDs.
 *
 * @param uidsString The string of UIDs to parse.
 * @param limit The maximum number of UIDs to accept without throwing an error.
 */
export function parseUidsString(uidsString: string, limit: number): string[] {
  const uids = new Set(
    uidsString
      .split(/[\s,;]+/)
      .map((uid) => uid.trim())
      .filter((uid) => uid),
  );

  if (limit != null && uids.size > limit) {
    throw new HttpStatusError(400, `Cannot provide more than ${limit} UIDs at a time`);
  }

  return Array.from(uids);
}
