export const SECOND_IN_MILLISECONDS = 1000;
export const MINUTE_IN_MILLISECONDS = 60 * SECOND_IN_MILLISECONDS;
export const HOUR_IN_MILLISECONDS = 60 * MINUTE_IN_MILLISECONDS;
export const DAY_IN_MILLISECONDS = 24 * HOUR_IN_MILLISECONDS;

/**
 * Format an interval (in milliseconds) to a human-readable string like '3 h 40 m'.
 *
 * @param interval Time interval in milliseconds.
 * @returns Human-readable string representing the interval.
 */
export function formatInterval(interval: number): string {
  const sign = interval < 0 ? '-' : '';

  const days = Math.floor(Math.abs(interval) / DAY_IN_MILLISECONDS);
  const hours = Math.floor(Math.abs(interval) / HOUR_IN_MILLISECONDS) % 24;
  const mins = Math.floor(Math.abs(interval) / MINUTE_IN_MILLISECONDS) % 60;
  const secs = Math.floor(Math.abs(interval) / SECOND_IN_MILLISECONDS) % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${sign}${days} d`);
  }
  if (hours > 0) {
    parts.push(`${sign}${hours} h`);
  }
  if (mins > 0) {
    parts.push(`${sign}${mins} min`);
  }
  if (secs > 0) {
    parts.push(`${sign}${secs} s`);
  }
  if (parts.length === 0) {
    parts.push('0 s');
  }

  return parts.join(' ');
}
