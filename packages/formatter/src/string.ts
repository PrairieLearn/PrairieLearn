/**
 * Truncates a string in the middle, preserving both the start and end to
 * maintain recognizability. Uses a 60/40 split favoring the start.
 * For example, "CS 101 Proficiency Exam" at maxLength 16 becomes
 * "CS 101 P... Exam".
 */
export function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  const ellipsis = '...';
  const remaining = Math.max(0, maxLength - ellipsis.length);
  const startLength = Math.ceil(remaining * 0.6);
  const endLength = remaining - startLength;
  if (endLength <= 0) {
    return str.slice(0, remaining) + ellipsis;
  }
  return str.slice(0, startLength) + ellipsis + str.slice(str.length - endLength);
}
