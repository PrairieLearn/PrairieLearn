import { type Temporal } from '@js-temporal/polyfill';
import { type FC, createContext, use } from 'react';

import { formatDate, formatDateFriendly } from '@prairielearn/formatter';
import { Tooltip } from '@prairielearn/ui';

interface FriendlyDateProps {
  date: Date | Temporal.PlainDateTime;
  timezone?: string;
  tooltip?: boolean;
  options?: Parameters<typeof formatDateFriendly>[2];
  fullOptions?: Parameters<typeof formatDate>[2];
}

export const FriendlyDate: FC<FriendlyDateProps> = ({
  date,
  timezone = null,
  tooltip = false,
  options,
  fullOptions,
}) => {
  const timezoneContext = use(TimezoneContext);
  timezone = timezone ?? timezoneContext;

  const friendlyString = formatDateFriendly(date, timezone, options);
  const fullString = formatDate(date, timezone, fullOptions);
  if (!tooltip) return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{friendlyString}</span>;
  return (
    <Tooltip placement="top" content={fullString}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }} role="img" aria-label={friendlyString}>
        {friendlyString}
      </span>
    </Tooltip>
  );
};

export const TimezoneContext = createContext<string>('UTC');
