import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { Placement } from 'react-bootstrap/types';

import { OverlayTrigger } from '@prairielearn/ui';

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
  placement?: Placement;
  className?: string;
}) {
  return (
    <OverlayTrigger placement={placement} tooltip={{ body, props: { id } }}>
      <button
        type="button"
        className={clsx('btn btn-xs btn-ghost p-0 border-0 lh-1 align-middle', className)}
        aria-label={ariaLabel}
      >
        <i className="bi bi-question-circle text-muted" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}
