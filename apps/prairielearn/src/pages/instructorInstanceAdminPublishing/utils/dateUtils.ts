import { Temporal } from '@js-temporal/polyfill';

/**
 * Date utility functions for publishing configuration
 */

/** Helper function to get current time in course timezone. */
export function nowInTimezone(timezone: string): Temporal.ZonedDateTime {
  return Temporal.Now.zonedDateTimeISO(timezone).round({ smallestUnit: 'seconds' });
}

export function nowDateInTimezone(timezone: string): Date {
  return new Date(nowInTimezone(timezone).toInstant().epochMilliseconds);
}

/** Convert a Temporal.Instant to a string for datetime-local inputs */
export function instantToString(instant: Temporal.Instant, timezone: string): string {
  // Remove seconds from the string
  // TODO: allow seconds
  return instant.toZonedDateTimeISO(timezone).toPlainDateTime().toString();
}

export function stringToZonedDateTime(string: string, timezone: string): Temporal.ZonedDateTime {
  return Temporal.PlainDateTime.from(string).toZonedDateTime(timezone);
}

export function parseDateTimeLocalString(string: string, timezone: string): Date {
  return new Date(stringToZonedDateTime(string, timezone).toInstant().epochMilliseconds);
}

/** Convert a datetime-local string to a Date object */
export function datetimeLocalStringToDate(dateString: string): Date {
  return new Date(dateString);
}
