import { Temporal } from '@js-temporal/polyfill';

export interface Timezone {
  /** IANA timezone identifier. */
  name: string;
  /** Offset from UTC at the represented instant, in milliseconds. */
  utc_offset: number;
}

export function formatTimezone(timezone: Timezone): string {
  const totalMinutes = Math.trunc(timezone.utc_offset / 60_000);
  const sign = totalMinutes < 0 ? '-' : '';
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60) || '00';
  const minutes = absoluteMinutes % 60 || '00';
  return `(UTC ${sign}${hours}:${minutes.toString().padStart(2, '0')}) ${timezone.name}`;
}

export type TimezoneDisambiguation = NonNullable<Temporal.ToInstantOptions['disambiguation']>;

/**
 * Interprets a civil date/time in an IANA timezone.
 *
 * Callers must choose a disambiguation policy explicitly so ambiguous and
 * nonexistent local times cannot silently depend on Temporal's default.
 */
export function plainDateTimeToDate(
  plainDateTime: Temporal.PlainDateTime,
  timeZone: string,
  disambiguation: TimezoneDisambiguation,
): Date {
  const zonedDateTime = plainDateTime.toZonedDateTime(timeZone, { disambiguation });
  return new Date(zonedDateTime.epochMilliseconds);
}

export function getLocalDate(date: Date, timeZone: string): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
}

function getTimezoneAtInstant(name: string, instant: Temporal.Instant): Timezone {
  let zonedDateTime: Temporal.ZonedDateTime;
  try {
    zonedDateTime = instant.toZonedDateTimeISO(name);
  } catch {
    throw new Error(`Timezone "${name}" is not supported by the server runtime`);
  }

  return {
    name,
    utc_offset: zonedDateTime.offsetNanoseconds / 1_000_000,
  };
}

export function getTimezoneByName(name: string, at = new Date()): Timezone {
  const instant = Temporal.Instant.fromEpochMilliseconds(at.getTime());
  return getTimezoneAtInstant(name, instant);
}

/**
 * Returns canonical timezone names supported by the server runtime, ordered by
 * their offset at the supplied instant and then by name.
 *
 * Runtime-supported aliases can be retained with `alwaysInclude`; this is
 * useful for existing stored configuration values because
 * `Intl.supportedValuesOf('timeZone')` only returns canonical names.
 */
export function getCanonicalTimezones({
  alwaysInclude = [],
  at = new Date(),
}: {
  alwaysInclude?: readonly string[];
  at?: Date;
} = {}): Timezone[] {
  const instant = Temporal.Instant.fromEpochMilliseconds(at.getTime());
  const names = new Set(Intl.supportedValuesOf('timeZone'));
  // Intl.supportedValuesOf('timeZone') omits UTC and a few other entries.
  names.add('UTC');

  for (const name of alwaysInclude) {
    try {
      getTimezoneAtInstant(name, instant);
      names.add(name);
    } catch {
      // Ignore timezone names that the server runtime cannot interpret.
    }
  }

  return [...names]
    .map((name) => getTimezoneAtInstant(name, instant))
    .sort((a, b) => a.utc_offset - b.utc_offset || a.name.localeCompare(b.name));
}

const ENGLISH_MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const DATE_TIME_PATTERN =
  /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}))(?:[T\s]+(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?)?\s*([AP]M)?(?:\s*(?:Z|UTC|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?))?)?$/i;

/**
 * Parses ISO, US numeric, and English month-name date/time inputs as civil time
 * in the supplied timezone. UTC designators and numeric offsets in the input are
 * ignored, matching PostgreSQL's `timestamp without time zone` input semantics.
 * Callers must explicitly choose how to resolve ambiguous or nonexistent times.
 */
export function parseDateTimeInTimezone(
  dateTime: string,
  timezone: string,
  disambiguation: TimezoneDisambiguation,
): Date {
  const normalizedDateTime = dateTime
    .trim()
    .replace(
      /^(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:,\s*|\s+)/i,
      '',
    )
    .replace(/^(\d{4})(\d{2})(\d{2})(?=[T\s]|$)/, '$1-$2-$3')
    .replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?=[T\s]|$)/, '$1-$2-$3')
    .replace(/^(\d{1,2})(?:-|\s+)([a-z]+)(?:-|\s+)(\d{2}|\d{4})(?=\s|$)/i, '$2 $1, $3')
    .replace(
      /^([a-z]+)\s+(\d{1,2})(?:,\s*|\s+)(\d{2}|\d{4})(?=\s|$)/i,
      (_, monthName: string, day: string, year: string) => {
        const normalizedMonthName = monthName.toLowerCase().replace(/^sept$/, 'sep');
        const month = ENGLISH_MONTHS.findIndex(
          (name) => name === normalizedMonthName || name.slice(0, 3) === normalizedMonthName,
        );
        if (month === -1) throw new Error(`Invalid month: "${monthName}"`);
        // Use the numeric US form so two-digit years share the same cutoff.
        return `${month + 1}/${day}/${year}`;
      },
    );
  const match = DATE_TIME_PATTERN.exec(normalizedDateTime);
  if (!match) throw new Error(`Invalid date/time: "${dateTime}"`);

  const isoYear = match.at(1);
  const isoMonth = match.at(2);
  const isoDay = match.at(3);
  const usMonth = match.at(4);
  const usDay = match.at(5);
  const usYear = match.at(6);
  const hour = match.at(7) ?? '0';
  const minute = match.at(8) ?? '0';
  const second = match.at(9);
  const meridiem = match.at(10);
  const yearNumber = Number(isoYear ?? usYear);
  let plainDate = Temporal.PlainDate.from(
    {
      year: usYear?.length === 2 ? yearNumber + (yearNumber < 70 ? 2000 : 1900) : yearNumber,
      month: Number(isoMonth ?? usMonth),
      day: Number(isoDay ?? usDay),
    },
    { overflow: 'reject' },
  );
  let hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second ?? 0);

  if (minuteNumber > 59 || secondNumber >= 60) {
    throw new Error(`Invalid time: "${dateTime}"`);
  }

  if (meridiem) {
    if (hourNumber < 1 || hourNumber > 12) {
      throw new Error(`Invalid 12-hour time: "${dateTime}"`);
    }
    hourNumber = (hourNumber % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0);
  } else if (hourNumber === 24 && minuteNumber === 0 && secondNumber === 0) {
    plainDate = plainDate.add({ days: 1 });
    hourNumber = 0;
  } else if (hourNumber > 23) {
    throw new Error(`Invalid time: "${dateTime}"`);
  }

  const normalizedSecond = second?.replace(/^\d+/, (value) => value.padStart(2, '0'));
  const normalizedTime = `${hourNumber.toString().padStart(2, '0')}:${minute.padStart(2, '0')}${
    normalizedSecond ? `:${normalizedSecond}` : ''
  }`;
  const plainDateTime = Temporal.PlainDateTime.from(`${plainDate}T${normalizedTime}`);
  return plainDateTimeToDate(plainDateTime, timezone, disambiguation);
}

/** Returns the first valid instant of a calendar day, including midnight DST transitions. */
export function getStartOfDayInTimezone(date: Temporal.PlainDate, timezone: string): Date {
  return new Date(date.toZonedDateTime(timezone).epochMilliseconds);
}

export function getAdjacentDates(
  dateStrings: Iterable<string>,
  currentDateString: string,
): { previousDate: Temporal.PlainDate | null; nextDate: Temporal.PlainDate | null } {
  let previousDateString: string | undefined;
  let nextDateString: string | undefined;
  for (const date of dateStrings) {
    if (date < currentDateString && (!previousDateString || date > previousDateString)) {
      previousDateString = date;
    }
    if (date > currentDateString && (!nextDateString || date < nextDateString)) {
      nextDateString = date;
    }
  }
  return {
    previousDate: previousDateString ? Temporal.PlainDate.from(previousDateString) : null,
    nextDate: nextDateString ? Temporal.PlainDate.from(nextDateString) : null,
  };
}
