import { type FC } from 'preact/compat';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

import { formatDate, formatDateFriendly } from '@prairielearn/formatter';

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
