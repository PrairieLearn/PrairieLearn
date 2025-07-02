export const SECOND_IN_MILLISECONDS = 1000;
export const MINUTE_IN_MILLISECONDS = 60 * SECOND_IN_MILLISECONDS;
export const HOUR_IN_MILLISECONDS = 60 * MINUTE_IN_MILLISECONDS;
export const DAY_IN_MILLISECONDS = 24 * HOUR_IN_MILLISECONDS;

/**
 * Makes an interval (in milliseconds).
 *
 * @param param.days The number of days in the interval.
 * @param param.hours The number of hours in the interval.
 * @param param.minutes The number of minutes in the interval.
 * @param param.seconds The number of seconds in the interval.
 */
export function makeInterval({
  days = 0,
  hours = 0,
  minutes = 0,
  seconds = 0,
}: {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}): number {
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

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

/**
 * Format an interval (in milliseconds) to a human-readable string like 'Until 6
 * minutes before the session start time'.
 *
 * @param interval Time interval in milliseconds relative to `reference` (positive intervals are after `reference`).
 * @param prefix The prefix to use, must be 'Until' or 'From' (or lowercase versions of these).
 * @param reference The reference time, for example 'session start time'.
 * @returns Human-readable string representing the interval.
 */
export function formatIntervalRelative(
  interval: number,
  prefix: 'Until' | 'until' | 'From' | 'from',
  reference: string,
): string {
  if (interval > 0) {
    return `${prefix} ${formatInterval(interval)} after ${reference}`;
  } else if (interval < 0) {
    return `${prefix} ${formatInterval(-interval)} before ${reference}`;
  } else if (interval === 0) {
    return `${prefix} ${reference}`;
  } else {
    return `Invalid interval: ${interval}`;
  }
}

/**
 * Format an interval (in milliseconds) to a human-readable string like HH:MM or +HH:MM.
 *
 * @param interval Time interval in milliseconds.
 * @param options.signed Whether to include the sign in the output.
 * @returns Human-readable string representing the interval in minutes.
 */
export function formatIntervalHM(
  interval: number,
  { signed = false }: { signed?: boolean } = { signed: false },
): string {
  const sign = interval < 0 ? '-' : interval > 0 ? (signed ? '+' : '') : '';
  const hours = Math.floor(Math.abs(interval) / HOUR_IN_MILLISECONDS);
  const mins = Math.floor(Math.abs(interval) / MINUTE_IN_MILLISECONDS) % 60;
  return `${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Format an interval (in milliseconds) to a human-readable string with the number of minutes, like '7 minutes' or '1 minute'.
 *
 * @param interval Time interval in milliseconds.
 * @returns Human-readable string representing the interval in minutes.
 */
export function formatIntervalMinutes(interval: number): string {
  const sign = interval < 0 ? '-' : '';
  const minutes = Math.ceil(Math.abs(interval / MINUTE_IN_MILLISECONDS));
  if (minutes === 1) {
    return `${sign}1 minute`;
  } else {
    return `${sign}${minutes} minutes`;
  }
}
