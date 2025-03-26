import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export const TimezoneCodec = z.object({
  name: z.string(),
  utc_offset: z.any(),
});
export type Timezone = z.infer<typeof TimezoneCodec>;

let memoizedAvailableTimezones: Timezone[] | null = null;
let memoizedAvailableTimezonesByName: Map<string, Timezone> | null = null;

async function getAvailableTimezonesFromDB(): Promise<Timezone[]> {
  const availableTimezones = await queryRows(sql.select_timezones, [], TimezoneCodec);
  return availableTimezones;
}

export async function getAvailableTimezones(): Promise<Timezone[]> {
  if (memoizedAvailableTimezones == null) {
    // Different portions of the code use the timezone in either PostgreSQL or
    // Intl, so we return only those timezones that are supported by both. While
    // Intl provides a list of supported timezones via Intl.supportedValuesOf(),
    // the list is not exhaustive and may not include some timezones supported
    // by JS as aliases. Instead, we attempt to create a new DateTimeFormat
    // element and filter out timezones for which this process returns and
    // error.
    const pgSupportedTimezones = await getAvailableTimezonesFromDB();
    memoizedAvailableTimezones = pgSupportedTimezones.filter(({ name }) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: name });
        return true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        return false;
      }
    });
  }
  return memoizedAvailableTimezones;
}

export async function getAvailableTimezonesByName(): Promise<Map<string, Timezone>> {
  if (memoizedAvailableTimezonesByName == null) {
    const availableTimezones = await getAvailableTimezones();
    memoizedAvailableTimezonesByName = new Map(availableTimezones.map((tz) => [tz.name, tz]));
  }
  return memoizedAvailableTimezonesByName;
}

export async function getTimezoneByName(name: string): Promise<Timezone> {
  const availableTimezonesByName = await getAvailableTimezonesByName();
  const timezone = availableTimezonesByName.get(name);
  if (timezone == null) {
    throw new Error(`Timezone "${name}" not found`);
  }
  return timezone;
}

export function formatTimezone(tz: Timezone): string {
  return `(UTC
    ${`${tz.utc_offset.hours ? tz.utc_offset.hours : '00'}:${
      tz.utc_offset.minutes
        ? tz.utc_offset.minutes > 0
          ? tz.utc_offset.minutes
          : tz.utc_offset.minutes * -1
        : '00'
    }) ${tz.name}`} `;
}
