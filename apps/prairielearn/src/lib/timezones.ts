import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

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
    memoizedAvailableTimezones = await getAvailableTimezonesFromDB();
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
