import { Temporal } from '@js-temporal/polyfill';

/**
 * Date utility functions for publishing configuration
 */

export function nowDateInTimezone(timezone: string): Date {
  return new Date(
    Temporal.Now.zonedDateTimeISO(timezone)
      .round({ smallestUnit: 'seconds' })
      .toInstant().epochMilliseconds,
  );
}

export function parseDateTimeLocalString(string: string, timezone: string): Date {
  return new Date(
    Temporal.PlainDateTime.from(string).toZonedDateTime(timezone).toInstant().epochMilliseconds,
  );
}

/** Convert a datetime-local string to a Date object */
export function datetimeLocalStringToDate(dateString: string): Date {
  return new Date(dateString);
}
