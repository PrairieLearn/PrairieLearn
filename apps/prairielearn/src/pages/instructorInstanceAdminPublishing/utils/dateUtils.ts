/**
 * Date utility functions for publishing configuration
 */

import { Temporal } from '@js-temporal/polyfill';

export function nowRoundedToSeconds(): Date {
  const now = new Date();
  now.setMilliseconds(0);
  return now;
}

/** Convert a datetime-local string to a Date object */
export function plainDateTimeStringToDate(string: string, timezone: string): Date {
  return new Date(
    Temporal.PlainDateTime.from(string).toZonedDateTime(timezone).toInstant().epochMilliseconds,
  );
}

/** Convert a Date object to a datetime-local string */
export function dateToPlainDateTime(date: Date, timezone: string): Temporal.PlainDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime();
}
