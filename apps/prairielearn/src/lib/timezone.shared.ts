/* Code that can be used on the frontend and backend */
import type { Timezone } from '@prairielearn/utils/timezone';

export function formatTimezone(tz: Timezone): string {
  const totalMinutes = Math.trunc(tz.utc_offset / 60_000);
  const sign = totalMinutes < 0 ? '-' : '';
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60) || '00';
  const minutes = absoluteMinutes % 60 || '00';
  return `(UTC ${sign}${hours}:${minutes.toString().padStart(2, '0')}) ${tz.name}`;
}
