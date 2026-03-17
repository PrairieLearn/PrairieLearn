import clsx from 'clsx';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';

const PAGE_SIZE = 25;

interface TransactionHistoryRow {
  id: string;
  created_at: Date;
  delta_milli_dollars: number;
  credit_after_milli_dollars: number;
  submission_count: number;
  reason: string;
  user_name: string | null;
  user_uid: string | null;
}

export function TransactionHistoryTable({
  rows,
  totalCount,
  page,
  onPageChange,
}: {
  rows: TransactionHistoryRow[];
  totalCount: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <>
      <div className="table-responsive border rounded overflow-hidden">
        <table className="table table-sm table-hover mb-0" aria-label="Transaction history">
          <thead>
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Change</th>
              <th className="px-3 py-2">Balance after</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">User</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted text-center py-4 px-3">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              rows.map((change) => (
                <tr key={change.id}>
                  <td className="align-middle px-3 py-2">{change.created_at.toLocaleString()}</td>
                  <td
                    className={clsx(
                      'align-middle px-3 py-2 fw-bold',
                      change.delta_milli_dollars > 0 ? 'text-success' : 'text-danger',
                    )}
                  >
                    {change.delta_milli_dollars > 0 ? '+' : ''}
                    {formatMilliDollars(change.delta_milli_dollars)}
                  </td>
                  <td className="align-middle px-3 py-2">
                    {formatMilliDollars(change.credit_after_milli_dollars)}
                  </td>
                  <td className="align-middle px-3 py-2">
                    {change.submission_count > 1
                      ? `${change.reason} (${change.submission_count} submissions)`
                      : change.reason}
                  </td>
                  <td className="align-middle px-3 py-2">
                    {change.user_name ?? change.user_uid ?? '\u2014'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <nav aria-label="Transaction history pagination" className="mt-3">
          <ul className="pagination pagination-sm justify-content-center mb-0">
            <li className={clsx('page-item', page <= 1 && 'disabled')}>
              <button
                type="button"
                className="page-link"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Previous
              </button>
            </li>
            <li className="page-item disabled">
              <span className="page-link">
                Page {page} of {totalPages}
              </span>
            </li>
            <li className={clsx('page-item', page >= totalPages && 'disabled')}>
              <button
                type="button"
                className="page-link"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </button>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}
