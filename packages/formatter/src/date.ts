import { toTemporalInstant } from '@js-temporal/polyfill';
import keyBy from 'lodash/keyBy.js';

/**
 * Format a date to a human-readable string like '2020-03-27T12:34:56 (CDT)'.
 *
 * @param date The date to format.
 * @param timeZone The time zone to use for formatting.
 * @param param2.includeTz Whether to include the time zone in the output (default true).
 * @param param2.longTz Whether to use the long time zone name (default false).
 * @returns Human-readable string representing the date.
 */
export function formatDate(
  date: Date,
  timeZone: string,
  {
    includeTz = true,
    longTz = false,
    includeMs = false,
  }: { includeTz?: boolean; longTz?: boolean; includeMs?: boolean } = {},
): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: includeMs ? 3 : undefined,
    timeZoneName: longTz ? 'long' : 'short',
  };
  const parts = keyBy(new Intl.DateTimeFormat('en-US', options).formatToParts(date), (x) => x.type);
  let dateFormatted = `${parts.year.value}-${parts.month.value}-${parts.day.value} ${parts.hour.value}:${parts.minute.value}:${parts.second.value}`;
  if (includeMs) {
    dateFormatted = `${dateFormatted}.${parts.fractionalSecond.value}`;
  }
  if (includeTz) {
    dateFormatted = `${dateFormatted} (${parts.timeZoneName.value})`;
  }
  return dateFormatted;
}

/**
 * Format a date to a human-readable string like '2020-03-27'.
 *
 * @param date The date to format.
 * @param timeZone The time zone to use for formatting.
 * @returns Human-readable string representing the date.
 */
export function formatDateYMD(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  const parts = keyBy(new Intl.DateTimeFormat('en-US', options).formatToParts(date), (x) => x.type);
  return `${parts.year.value}-${parts.month.value}-${parts.day.value}`;
}

/**
 * Format a date to a human-readable string like '2020-03-27 14:27'.
 *
 * @param date The date to format.
 * @param timeZone The time zone to use for formatting.
 * @returns Human-readable string representing the date.
 */
export function formatDateYMDHM(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };
  const parts = keyBy(new Intl.DateTimeFormat('en-US', options).formatToParts(date), (x) => x.type);
  return `${parts.year.value}-${parts.month.value}-${parts.day.value} ${parts.hour.value}:${parts.minute.value}`;
}

/**
 * Format a time zone to a human-readable string like 'CDT'.
 *
 * @param timeZone The time zone to format.
 * @returns Human-readable string representing the time zone.
 */
export function formatTz(timeZone: string): string {
  const date = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(date);
  const tz = parts.find((p) => p.type === 'timeZoneName');
  return tz ? tz.value : timeZone;
}

/**
 * Format a date to a human-readable string like '14:27:00 (CDT)'.
 *
 * @param date The date to format.
 * @param timeZone The time zone to use for formatting.
 * @param param2.includeTz Whether to include the time zone in the output (default true).
 * @returns Human-readable string representing the date.
 */
export function formatDateHMS(
  date: Date,
  timeZone: string,
  { includeTz = true }: { includeTz?: boolean } = {},
): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  };
  const parts = keyBy(new Intl.DateTimeFormat('en-US', options).formatToParts(date), (x) => x.type);
  let dateFormatted = `${parts.hour.value}:${parts.minute.value}:${parts.second.value}`;
  if (includeTz) {
    dateFormatted = `${dateFormatted} (${parts.timeZoneName.value})`;
  }
  return dateFormatted;
}

/**
 * Format a date to a human-readable string like '18:23' or 'May 2, 07:12',
 * where the precision is determined by the range.
 *
 * @param date The date to format.
 * @param rangeStart The start of the range.
 * @param rangeEnd The end of the range.
 * @param timeZone The time zone to use for formatting.
 * @returns Human-readable string representing the date.
 */
export function formatDateWithinRange(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string,
): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  const dateParts = keyBy(
    new Intl.DateTimeFormat('en-US', options).formatToParts(date),
    (x) => x.type,
  );
  const startParts = keyBy(
    new Intl.DateTimeFormat('en-US', options).formatToParts(rangeStart),
    (x) => x.type,
  );
  const endParts = keyBy(
    new Intl.DateTimeFormat('en-US', options).formatToParts(rangeEnd),
    (x) => x.type,
  );

  // format the date (not time) parts
  const dateYMD = `${dateParts.year.value}-${dateParts.month.value}-${dateParts.day.value}`;
  const startYMD = `${startParts.year.value}-${startParts.month.value}-${startParts.day.value}`;
  const endYMD = `${endParts.year.value}-${endParts.month.value}-${endParts.day.value}`;

  if (dateYMD === startYMD && dateYMD === endYMD) {
    // only show the time if the date is the same for all three
    return `${dateParts.hour.value}:${dateParts.minute.value}`;
  }

  // format the year, but not the month or day
  const dateY = `${dateParts.year.value}`;
  const startY = `${startParts.year.value}`;
  const endY = `${endParts.year.value}`;

  // if the year is the same for all three, show the month, day, and time
  if (dateY === startY && dateY === endY) {
    const options: Intl.DateTimeFormatOptions = {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    const dateParts = keyBy(
      new Intl.DateTimeFormat('en-US', options).formatToParts(date),
      (x) => x.type,
    );
    return `${dateParts.month.value} ${dateParts.day.value}, ${dateParts.hour.value}:${dateParts.minute.value}`;
  }

  // fall back to the full date
  return `${dateParts.year.value}-${dateParts.month.value}-${dateParts.day.value} ${dateParts.hour.value}:${dateParts.minute.value}`;
}

/**
 * Format a Date to date and time strings in the given time zone. The date is
 * formatted like
 * - 'today'
 * - 'Mon, Mar 20' (if within 180 days of the base date)
 * - 'Wed, Jan 1, 2020'
 *
 * The time format leaves off zero minutes and seconds, and uses 12-hour time,
 * giving strings like
 * - '3pm'
 * - '3:34pm'
 * - '3:34:17pm'
 *
 * @param date The date to format.
 * @param timezone The time zone to use for formatting.
 * @param baseDate The base date to use for comparison.
 */
function formatDateFriendlyParts(
  date: Date,
  timezone: string,
  baseDate: Date,
): { dateFormatted: string; timeFormatted: string; timezoneFormatted: string } {
  // compute the number of days from the base date (0 = today, 1 = tomorrow, etc.)

  const baseZonedDateTime = toTemporalInstant.call(baseDate).toZonedDateTimeISO(timezone);
  const zonedDateTime = toTemporalInstant.call(date).toZonedDateTimeISO(timezone);

  const basePlainDate = baseZonedDateTime.toPlainDate();
  const plainDate = zonedDateTime.toPlainDate();

  const daysOffset = plainDate.since(basePlainDate, { largestUnit: 'day' }).days;

  // format the parts of the date and time

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hourCycle: 'h12',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  };
  const parts = keyBy(new Intl.DateTimeFormat('en-US', options).formatToParts(date), (x) => x.type);

  // format the date string

  let dateFormatted = '';
  if (daysOffset === 0) {
    dateFormatted = 'today';
  } else if (daysOffset === 1) {
    dateFormatted = 'tomorrow';
  } else if (daysOffset === -1) {
    dateFormatted = 'yesterday';
  } else if (Math.abs(daysOffset) <= 180) {
    // non-breaking-space (\u00a0) is used between the month and day
    dateFormatted = `${parts.weekday.value}, ${parts.month.value}\u00a0${parts.day.value}`;
  } else {
    dateFormatted = `${parts.weekday.value}, ${parts.month.value}\u00a0${parts.day.value}, ${parts.year.value}`;
  }

  // format the time string

  let timeFormatted = '';
  if (parts.minute.value === '00' && parts.second.value === '00') {
    timeFormatted = `${parts.hour.value}`;
  } else if (parts.second.value === '00') {
    timeFormatted = `${parts.hour.value}:${parts.minute.value}`;
  } else {
    timeFormatted = `${parts.hour.value}:${parts.minute.value}:${parts.second.value}`;
  }
  // add the am/pm part
  timeFormatted = `${timeFormatted}${parts.dayPeriod.value.toLowerCase()}`;

  // format the timezone

  const timezoneFormatted = `(${parts.timeZoneName.value})`;

  return {
    dateFormatted,
    timeFormatted,
    timezoneFormatted,
  };
}

/**
 * Format a date to a string like:
 * - 'today, 3pm'
 * - 'tomorrow, 10:30am'
 * - 'yesterday, 11:45pm'
 * - 'Mon, Mar 20, 8:15am' (if within 180 days of the base date)
 * - 'Wed, Jan 1, 2020, 12pm'
 * - `today, 3pm (CDT)` (if `includeTz` is true)
 * - `3pm today` (if `timeFirst` is true)
 * - 'today' (if `dateOnly` is true)
 *
 * If using this within a sentence like `... at ${formatDateFriendlyString()}`,
 * use `timeFirst: true` to improve readability.
 *
 * @param date The date to format.
 * @param timezone The time zone to use for formatting.
 * @param param.baseDate The base date to use for comparison (default is the current date).
 * @param param.includeTz Whether to include the time zone in the output (default true).
 * @param param.timeFirst If true, the time is shown before the date (default false).
 * @param param.dateOnly If true, only the date is shown (default false).
 * @param param.timeOnly If true, only the time is shown (default false).
 * @returns Human-readable string representing the date and time.
 */
export function formatDateFriendly(
  date: Date,
  timezone: string,
  {
    baseDate = new Date(),
    includeTz = true,
    timeFirst = false,
    dateOnly = false,
    timeOnly = false,
  }: {
    baseDate?: Date;
    includeTz?: boolean;
    timeFirst?: boolean;
    dateOnly?: boolean;
    timeOnly?: boolean;
  } = {},
): string {
  const { dateFormatted, timeFormatted, timezoneFormatted } = formatDateFriendlyParts(
    date,
    timezone,
    baseDate,
  );

  let dateTimeFormatted = '';
  if (dateOnly) {
    dateTimeFormatted = dateFormatted;
  } else if (timeOnly) {
    dateTimeFormatted = timeFormatted;
  } else {
    if (timeFirst) {
      dateTimeFormatted = `${timeFormatted} ${dateFormatted}`;
    } else {
      dateTimeFormatted = `${dateFormatted}, ${timeFormatted}`;
    }
  }
  if (includeTz) {
    dateTimeFormatted = `${dateTimeFormatted} ${timezoneFormatted}`;
  }
  return dateTimeFormatted;
}

/**
 * Format a datetime range to a string like:
 * - 'today, 10am'
 * - 'today, 3pm to 5pm'
 * - 'today, 3pm to tomorrow, 5pm'
 * - 'today, 3pm to 5pm (CDT)' (if `includeTz` is true)
 * - '3pm today to 5pm tomorrow' (if `timeFirst` is true)
 * - 'today to tomorrow' (if `dateOnly` is true)
 *
 * This uses `formatDateFriendlyString()` to format the individual dates and times.
 *
 * @param start The start date and time.
 * @param end The end date and time.
 * @param timezone The time zone to use for formatting.
 * @param options Additional options for formatting the displayed date, taken from `formatDateFriendlyString()`.
 * @returns Human-readable string representing the datetime range.
 */
export function formatDateRangeFriendly(
  start: Date,
  end: Date,
  timezone: string,
  {
    baseDate = new Date(),
    includeTz = true,
    timeFirst = false,
    dateOnly = false,
  }: Parameters<typeof formatDateFriendly>[2] = {},
): string {
  const {
    dateFormatted: startDateFormatted,
    timeFormatted: startTimeFormatted,
    timezoneFormatted,
  } = formatDateFriendlyParts(start, timezone, baseDate);
  const { dateFormatted: endDateFormatted, timeFormatted: endTimeFormatted } =
    formatDateFriendlyParts(end, timezone, baseDate);

  let result: string | undefined;
  if (dateOnly) {
    if (startDateFormatted === endDateFormatted) {
      result = startDateFormatted;
    } else {
      result = `${startDateFormatted} to ${endDateFormatted}`;
    }
  } else {
    if (startDateFormatted === endDateFormatted) {
      let timeRangeFormatted: string | undefined;
      if (startTimeFormatted === endTimeFormatted) {
        timeRangeFormatted = startTimeFormatted;
      } else {
        timeRangeFormatted = `${startTimeFormatted} to ${endTimeFormatted}`;
      }
      if (timeFirst) {
        result = `${timeRangeFormatted} ${startDateFormatted}`;
      } else {
        result = `${startDateFormatted}, ${timeRangeFormatted}`;
      }
    } else {
      if (timeFirst) {
        result = `${startTimeFormatted} ${startDateFormatted} to ${endTimeFormatted} ${endDateFormatted}`;
      } else {
        result = `${startDateFormatted}, ${startTimeFormatted} to ${endDateFormatted}, ${endTimeFormatted}`;
      }
    }
  }
  if (includeTz) {
    result = `${result} ${timezoneFormatted}`;
  }
  return result;
}
