import { Temporal } from '@js-temporal/polyfill';

import { plainDateTimeToDate } from '@prairielearn/utils/timezone';

const LOCAL_DATE_TIME_PATTERN = /([0-9]{4}-[0-9]{2}-[0-9]{2})[ T]([0-9]{2}:[0-9]{2}:[0-9]{2})/;

/**
 * Parses the local date/time syntax accepted in course configuration files.
 *
 * PostgreSQL historically resolved both ambiguous fall-back times and
 * nonexistent spring-forward times to the later possible instant. We specify
 * that policy explicitly so it cannot change with a Temporal default.
 */
export function parseLocalDateTime(dateString: string, timeZone: string): Date;
export function parseLocalDateTime(dateString: null, timeZone: string): null;
export function parseLocalDateTime(dateString: string | null, timeZone: string): Date | null;
export function parseLocalDateTime(dateString: string | null, timeZone: string): Date | null {
  if (dateString == null) return null;

  const match = LOCAL_DATE_TIME_PATTERN.exec(dateString);
  if (!match) {
    throw new Error(
      `Invalid date format: ${dateString}, must be like either "2016-07-24T16:52:48" or "2016-07-24 16:52:48"`,
    );
  }

  const plainDateTime = Temporal.PlainDateTime.from(`${match[1]}T${match[2]}`);
  return plainDateTimeToDate(plainDateTime, timeZone, 'later');
}
