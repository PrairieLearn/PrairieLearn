import clsx from 'clsx';
import type { ReactNode } from 'react';

import { Tooltip, type TooltipProps } from '@prairielearn/ui';

export function HelpTooltip({
  body,
  id,
  ariaLabel,
  placement = 'top',
  className,
}: {
  body: ReactNode;
  id: string;
  ariaLabel: string;
  placement?: TooltipProps['placement'];
  className?: string;
}) {
  return (
    <Tooltip id={id} placement={placement} content={body}>
      <button
        type="button"
        className={clsx('btn btn-xs btn-ghost p-0 border-0 lh-1 align-middle', className)}
        aria-label={ariaLabel}
      >
        <i className="bi bi-question-circle text-muted" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
