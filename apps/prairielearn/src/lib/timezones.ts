import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type Timezone, TimezoneCodec } from './timezone.shared.js';

const sql = loadSqlEquiv(import.meta.url);

let memoizedAvailableTimezones: Timezone[] | null = null;
let memoizedAvailableTimezonesByName: Map<string, Timezone> | null = null;

async function getAvailableTimezonesFromDB(): Promise<Timezone[]> {
  const availableTimezones = await queryRows(sql.select_timezones, TimezoneCodec);
  return availableTimezones;
}

/**
 * Returns a list of all timezones supported by the database. The list is
 * memoized so that, if it is needed more than once in the same session, the
 * same list is returned.
 */
export async function getAvailableTimezones(): Promise<Timezone[]> {
  if (memoizedAvailableTimezones == null) {
    memoizedAvailableTimezones = await getAvailableTimezonesFromDB();
  }
  return memoizedAvailableTimezones;
}

/**
 * Returns a filtered list of canonical timezones that are supported by both
 * Postgres and the JavaScript Intl API. As per the specification of
 * Intl.supportedValuesOf('timeZone'), the list includes only canonical timezone
 * names, and does not include aliases or deprecated names.
 *
 * @param alwaysInclude - Optional array of timezone names to always include in
 * the result, even if they're not canonical. These timezones are only included
 * if they're supported by Postgres.
 */
export async function getCanonicalTimezones(alwaysInclude?: string[]): Promise<Timezone[]> {
  const availableTimezones = await getAvailableTimezones();
  const canonicalTimezones = new Set(Intl.supportedValuesOf('timeZone'));
  // Intl.supportedValuesOf('timeZone') returns the list of canonical timezones,
  // but it skips UTC and a few other entries
  // (https://github.com/tc39/ecma402/issues/778). We include UTC manually.
  canonicalTimezones.add('UTC');
  return availableTimezones.filter(
    ({ name }) => canonicalTimezones.has(name) || alwaysInclude?.includes(name),
  );
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
