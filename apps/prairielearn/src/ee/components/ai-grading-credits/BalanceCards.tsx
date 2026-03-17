import { useId } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';

const TOOLTIP_TEXT = {
  instructor: {
    transferable: 'These credits can be transferred between course instances in your institution.',
    nonTransferable:
      'These credits are specifically for this course instance and cannot be transferred.',
  },
  admin: {
    transferable:
      'Credits that can be transferred between course instances within the same institution.',
    nonTransferable: 'Credits locked to this course instance that cannot be transferred.',
  },
};

export function BalanceCards({
  pool,
  context,
  dimmed = false,
}: {
  pool: {
    total_milli_dollars: number;
    credit_transferable_milli_dollars: number;
    credit_non_transferable_milli_dollars: number;
  };
  context: 'instructor' | 'admin';
  dimmed?: boolean;
}) {
  const transferableTooltipId = useId();
  const nonTransferableTooltipId = useId();
  const tooltips = TOOLTIP_TEXT[context];

  const dimStyle = dimmed ? { opacity: 0.4 } : undefined;

  return (
    <div className="row mb-3 g-3">
      <div className="col-md-4">
        <div className="border rounded p-3 text-center" style={dimStyle}>
          <div className="text-muted small">Total available</div>
          <div className="h4 mb-0">{formatMilliDollars(pool.total_milli_dollars)}</div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="border rounded p-3 text-center" style={dimStyle}>
          <div className="text-muted small">
            Transferable{' '}
            <OverlayTrigger
              placement="top"
              tooltip={{
                body: tooltips.transferable,
                props: { id: transferableTooltipId },
              }}
            >
              <button
                type="button"
                className="btn btn-link p-0 border-0 align-baseline"
                aria-label="More information about transferable credits"
              >
                <i className="bi bi-info-circle" aria-hidden="true" />
              </button>
            </OverlayTrigger>
          </div>
          <div className="h5 mb-0">
            {formatMilliDollars(pool.credit_transferable_milli_dollars)}
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="border rounded p-3 text-center" style={dimStyle}>
          <div className="text-muted small">
            Non-transferable{' '}
            <OverlayTrigger
              placement="top"
              tooltip={{
                body: tooltips.nonTransferable,
                props: { id: nonTransferableTooltipId },
              }}
            >
              <button
                type="button"
                className="btn btn-link p-0 border-0 align-baseline"
                aria-label="More information about non-transferable credits"
              >
                <i className="bi bi-info-circle" aria-hidden="true" />
              </button>
            </OverlayTrigger>
          </div>
          <div className="h5 mb-0">
            {formatMilliDollars(pool.credit_non_transferable_milli_dollars)}
          </div>
        </div>
      </div>
    </div>
  );
}
