import { Temporal } from '@js-temporal/polyfill';
import { type FC, createContext, use, useEffect, useState } from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

import { formatDate, formatDateFriendly } from '@prairielearn/formatter';

interface FriendlyDateProps {
  date: Date | Temporal.PlainDateTime;
  timezone?: string;
  tooltip?: boolean;
  live?: boolean;
  options?: Parameters<typeof formatDateFriendly>[2];
  fullOptions?: Parameters<typeof formatDate>[2];
}

export const FriendlyDate: FC<FriendlyDateProps> = ({
  date,
  timezone = null,
  tooltip = false,
  live = false,
  options,
  fullOptions,
}) => {
  const timezoneContext = use(TimezoneContext);
  timezone = timezone ?? timezoneContext;

  // Capture "now" once on mount to avoid impure new Date() calls during re-renders.
  const [baseDate, setBaseDate] = useState(() => new Date());

  // Refresh baseDate every 60s so relative labels (today/tomorrow/yesterday)
  // stay accurate when the page is left open across day boundaries.
  // Only runs when `live` is true and the date is within ±2 days of now
  // (the range where relative labels apply).
  useEffect(() => {
    if (!live) return;

    const targetMs =
      date instanceof Temporal.PlainDateTime
        ? date.toZonedDateTime(timezone!).epochMilliseconds
        : date.getTime();
    if (Math.abs(targetMs - Date.now()) > 2 * 24 * 60 * 60 * 1000) return;

    const id = setInterval(() => setBaseDate(new Date()), 60_000);
    return () => clearInterval(id);
  }, [live, date, timezone]);

  const friendlyString = formatDateFriendly(date, timezone, {
    baseDate,
    ...options,
  });
  const fullString = formatDate(date, timezone, fullOptions);
  if (!tooltip) return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{friendlyString}</span>;
  return (
    <OverlayTrigger
      placement="top"
      delay={{ show: 100, hide: 100 }}
      overlay={<Tooltip>{fullString}</Tooltip>}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{friendlyString}</span>
    </OverlayTrigger>
  );
};

export const TimezoneContext = createContext<string>('UTC');
