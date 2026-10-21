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
