import { type Temporal } from '@js-temporal/polyfill';
import { type FC, createContext, use } from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

import { formatDate, formatDateFriendly } from '@prairielearn/formatter';
import { type HtmlSafeString, html } from '@prairielearn/html';

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

export function FriendlyDateHtml(
  props: Omit<FriendlyDateProps, 'timezone'> & { timezone: string },
): HtmlSafeString {
  const friendlyString = formatDateFriendly(props.date, props.timezone, props.options);
  const fullString = formatDate(props.date, props.timezone, props.fullOptions);

  if (!props.tooltip) {
    return html`<span style="font-variant-numeric: tabular-nums;">${friendlyString}</span>`;
  }

  return html`
    <span
      style="font-variant-numeric: tabular-nums;"
      data-bs-toggle="tooltip"
      data-bs-placement="top"
      title="${fullString}"
    >
      ${friendlyString}
    </span>
  `;
}
