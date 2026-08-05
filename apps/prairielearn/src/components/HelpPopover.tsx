import clsx from 'clsx';
import type { ReactNode } from 'react';

import { Popover, type PopoverProps } from '@prairielearn/ui';

export function HelpPopover({
  children,
  ariaLabel,
  placement = 'top',
  className,
}: {
  children: ReactNode;
  ariaLabel: string;
  placement?: PopoverProps['placement'];
  className?: string;
}) {
  return (
    <Popover content={children} placement={placement}>
      <button
        type="button"
        className={clsx('btn btn-xs btn-ghost p-0 border-0 lh-1 align-middle', className)}
        aria-label={ariaLabel}
      >
        <i className="bi bi-question-circle text-muted" aria-hidden="true" />
      </button>
    </Popover>
  );
}
