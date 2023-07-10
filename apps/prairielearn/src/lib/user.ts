/**
 * Parses a string of UIDs separated by commas, whitespace, line breaks, or semicolons
 * into an array of unique UIDs.
 */
export function parseUidsString(uidsString: string): string[] {
  const uids = new Set(
    uidsString
      .split(/[\s,;]+/)
      .map((uid) => uid.trim())
      .filter((uid) => uid),
  );
  return Array.from(uids);
}
