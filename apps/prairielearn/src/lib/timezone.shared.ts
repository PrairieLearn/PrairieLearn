/* Code that can be used on the frontend and backend */
import { z } from 'zod';

export const TimezoneCodec = z.object({
  name: z.string(),
  utc_offset: z.any(),
});
export type Timezone = z.infer<typeof TimezoneCodec>;

export function formatTimezone(tz: Timezone): string {
  return `(UTC ${`${tz.utc_offset.hours || '00'}:${
    tz.utc_offset.minutes
      ? tz.utc_offset.minutes > 0
        ? tz.utc_offset.minutes
        : tz.utc_offset.minutes * -1
      : '00'
  }) ${tz.name}`}`;
}
