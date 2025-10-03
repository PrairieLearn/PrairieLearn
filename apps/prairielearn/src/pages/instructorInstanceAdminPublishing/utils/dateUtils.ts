import { Temporal } from '@js-temporal/polyfill';

/**
 * Date utility functions for publishing configuration
 */

/** Helper function to get current time in course timezone. */
export function nowInTimezone(timezone: string): Temporal.Instant {
  return Temporal.Now.zonedDateTimeISO(timezone).toInstant();
}

/** Convert a Date object to Temporal.Instant */
export function instantFromDate(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

/** Convert a Temporal.Instant to a string for datetime-local inputs */
export function instantToString(instant: Temporal.Instant, timezone: string): string {
  // Remove seconds from the string
  // TODO: allow seconds
  return instant.toZonedDateTimeISO(timezone).toPlainDateTime().toString();
}

/** Helper function to add weeks to a datetime string. */
export function addWeeksToDatetime(
  instant: Temporal.Instant,
  weeks: number,
  timezone: string,
): Temporal.Instant {
  return instant.toZonedDateTimeISO(timezone).add({ weeks }).toInstant();
}

/** Convert a Date object to YYYY-MM-DDTHH:mm:ss format for datetime-local inputs */
export function dateToDatetimeLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/** Convert a datetime-local string to a Date object */
export function datetimeLocalStringToDate(dateString: string): Date {
  return new Date(dateString);
}
