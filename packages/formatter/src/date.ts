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
  { includeTz = true, longTz = false }: { includeTz?: boolean; longTz?: boolean } = {},
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
    timeZoneName: longTz ? 'long' : 'short',
  };
  const parts = keyBy(new Intl.DateTimeFormat('en-US', options).formatToParts(date), (x) => x.type);
  let dateFormatted = `${parts.year.value}-${parts.month.value}-${parts.day.value} ${parts.hour.value}:${parts.minute.value}:${parts.second.value}`;
  if (includeTz) {
    dateFormatted = `${dateFormatted} (${parts.timeZoneName.value})`;
  }
  return dateFormatted;
}
