import clsx from 'clsx';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';

export function BalanceCards({
  pool,
  dimmed,
}: {
  pool: {
    total_milli_dollars: number;
    credit_transferable_milli_dollars: number;
    credit_non_transferable_milli_dollars: number;
  };
  dimmed?: boolean;
}) {
  return (
    <div className={clsx('row mb-3 g-3', dimmed && 'opacity-50')}>
      <div className="col-md-4">
        <div className="border rounded p-3 text-center">
          <div className="text-muted small">Total available</div>
          <div className="h4 mb-0">{formatMilliDollars(pool.total_milli_dollars)}</div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="border rounded p-3 text-center">
          <div className="text-muted small">Transferable</div>
          <div className="h5 mb-0">
            {formatMilliDollars(pool.credit_transferable_milli_dollars)}
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="border rounded p-3 text-center">
          <div className="text-muted small">Non-transferable</div>
          <div className="h5 mb-0">
            {formatMilliDollars(pool.credit_non_transferable_milli_dollars)}
          </div>
        </div>
      </div>
    </div>
  );
}
