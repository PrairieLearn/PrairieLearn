import { type FC } from 'preact/compat';
import OverlayTriggerOriginal from 'react-bootstrap/cjs/OverlayTrigger.js';
import TooltipOriginal from 'react-bootstrap/cjs/Tooltip.js';

import { formatDate, formatDateFriendly } from '@prairielearn/formatter';

const OverlayTrigger = OverlayTriggerOriginal as unknown as typeof OverlayTriggerOriginal.default;
const Tooltip = TooltipOriginal as unknown as typeof TooltipOriginal.default;

export interface FriendlyDateProps {
  date: Date;
  timezone: string;
  tooltip?: boolean;
  options?: Parameters<typeof formatDateFriendly>[2];
  fullOptions?: Parameters<typeof formatDate>[2];
}

export const FriendlyDate: FC<FriendlyDateProps> = ({
  date,
  timezone,
  tooltip = false,
  options,
  fullOptions,
}) => {
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
