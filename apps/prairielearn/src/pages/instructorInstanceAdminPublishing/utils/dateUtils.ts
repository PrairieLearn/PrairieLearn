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

/** Convert a datetime-local string to a Date object */
export function plainDateTimeStringToDate(string: string, timezone: string): Date {
  return new Date(
    Temporal.PlainDateTime.from(string).toZonedDateTime(timezone).toInstant().epochMilliseconds,
  );
}

/** Convert a Date object to a datetime-local string */
export function DateToPlainDateTime(date: Date, timezone: string): Temporal.PlainDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime();
}
