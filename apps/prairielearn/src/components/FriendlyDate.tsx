import { type Temporal } from '@js-temporal/polyfill';
import { type FC, createContext, use } from 'react';

import { formatDate, formatDateFriendly } from '@prairielearn/formatter';

interface FriendlyDateProps {
  date: Date | Temporal.PlainDateTime;
  timezone?: string;
  options?: Parameters<typeof formatDateFriendly>[2];
  fullOptions?: Parameters<typeof formatDate>[2];
}

export const FriendlyDate: FC<FriendlyDateProps> = ({
  date,
  timezone = null,
  options,
  fullOptions,
}) => {
  const timezoneContext = use(TimezoneContext);
  timezone = timezone ?? timezoneContext;

  const friendlyString = formatDateFriendly(date, timezone, options);
  const fullString = formatDate(date, timezone, fullOptions);
  return (
    <time
      dateTime={
        date instanceof Date
          ? date.toISOString()
          : date.toString({ calendarName: 'never', fractionalSecondDigits: 3 })
      }
      title={fullString}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {friendlyString}
    </time>
  );
};

export const TimezoneContext = createContext<string>('UTC');
