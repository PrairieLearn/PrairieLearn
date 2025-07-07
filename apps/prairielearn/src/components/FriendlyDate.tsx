import { type FC } from 'preact/compat';
import OverlayTriggerOriginal from 'react-bootstrap/cjs/OverlayTrigger.js';
import TooltipOriginal from 'react-bootstrap/cjs/Tooltip.js';

import { formatDate, formatDateFriendly } from '@prairielearn/formatter';

const OverlayTrigger = (OverlayTriggerOriginal as any).default || OverlayTriggerOriginal;
const Tooltip = (TooltipOriginal as any).default || TooltipOriginal;

export interface FriendlyDateProps {
  date: Date;
  timezone: string;
  tooltip?: boolean;
}

export const FriendlyDate: FC<FriendlyDateProps> = ({ date, timezone, tooltip = false }) => {
  const friendlyString = formatDateFriendly(date, timezone);
  const fullString = formatDate(date, timezone);
  if (!tooltip) return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{friendlyString}</span>;
  return (
    <OverlayTrigger placement="top" delay={{ show: 100 }} overlay={<Tooltip>{fullString}</Tooltip>}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{friendlyString}</span>
    </OverlayTrigger>
  );
};
