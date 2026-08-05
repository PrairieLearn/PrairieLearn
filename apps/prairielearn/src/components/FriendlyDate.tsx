import { type Temporal } from '@js-temporal/polyfill';
import { type FC, createContext, use } from 'react';

import { formatDate, formatDateFriendly } from '@prairielearn/formatter';
import { Popover } from '@prairielearn/ui';

interface FriendlyDateProps {
  date: Date | Temporal.PlainDateTime;
  timezone?: string;
  withPopover?: boolean;
  options?: Parameters<typeof formatDateFriendly>[2];
  fullOptions?: Parameters<typeof formatDate>[2];
}

export const FriendlyDate: FC<FriendlyDateProps> = ({
  date,
  timezone = null,
  withPopover = false,
  options,
  fullOptions,
}) => {
  const timezoneContext = use(TimezoneContext);
  timezone = timezone ?? timezoneContext;

  const friendlyString = formatDateFriendly(date, timezone, options);
  const fullString = formatDate(date, timezone, fullOptions);
  if (!withPopover) {
    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{friendlyString}</span>;
  }
  return (
    <Popover content={fullString} placement="top">
      <button
        type="button"
        className="btn btn-link link-body-emphasis border-0 p-0 align-baseline text-decoration-none"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {friendlyString}
      </button>
    </Popover>
  );
};

export const TimezoneContext = createContext<string>('UTC');
