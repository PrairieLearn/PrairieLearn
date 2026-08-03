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
    <Tooltip content={fullString} placement="top" delay={100} closeDelay={100}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{friendlyString}</span>
    </Tooltip>
  );
};

export const TimezoneContext = createContext<string>('UTC');
