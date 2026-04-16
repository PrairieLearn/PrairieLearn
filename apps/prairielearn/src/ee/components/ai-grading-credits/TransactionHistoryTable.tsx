import clsx from 'clsx';
import { useRef, useState } from 'react';
import { Badge, Button, Modal } from 'react-bootstrap';

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
  checkout_session_id: string | null;
  checkout_session_refunded_at: Date | null;
  checkout_session_amount_milli_dollars: number | null;
}

export function TransactionHistoryTable({
  rows,
  totalCount,
  page,
  onPageChange,
  showRefundActions,
  transferableMilliDollars,
  onRefund,
  isRefunding,
}: {
  rows: TransactionHistoryRow[];
  totalCount: number;
  page: number;
  onPageChange: (page: number) => void;
  showRefundActions?: boolean;
  transferableMilliDollars?: number;
  onRefund?: (checkoutSessionId: string) => void;
  isRefunding?: boolean;
}) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const [refundTarget, setRefundTarget] = useState<TransactionHistoryRow | null>(null);
  const wasRefundingRef = useRef(false);

  // Close modal when refund finishes (transition from refunding -> not refunding).
  // Computed during render per React docs recommendation for adjusting state on prop change.
  if (wasRefundingRef.current && !isRefunding && refundTarget != null) {
    setRefundTarget(null);
  }
  wasRefundingRef.current = isRefunding ?? false;

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
                    {change.checkout_session_refunded_at != null &&
                      change.delta_milli_dollars > 0 && (
                        <Badge bg="secondary" className="ms-2">
                          Refunded
                        </Badge>
                      )}
                    {showRefundActions && (
                      <RefundActionInline
                        row={change}
                        onClickRefund={() => setRefundTarget(change)}
                      />
                    )}
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

      {refundTarget && (
        <RefundConfirmationModal
          row={refundTarget}
          isRefunding={isRefunding ?? false}
          transferableMilliDollars={transferableMilliDollars ?? 0}
          onConfirm={() => {
            if (refundTarget.checkout_session_id && onRefund) {
              onRefund(refundTarget.checkout_session_id);
            }
          }}
          onCancel={() => setRefundTarget(null)}
        />
      )}
    </>
  );
}

function RefundActionInline({
  row,
  onClickRefund,
}: {
  row: TransactionHistoryRow;
  onClickRefund: () => void;
}) {
  if (!row.checkout_session_id || row.delta_milli_dollars <= 0) {
    return null;
  }

  if (row.checkout_session_refunded_at != null) {
    return null;
  }

  return (
    <Button variant="outline-danger" size="sm" className="ms-2" onClick={onClickRefund}>
      Refund
    </Button>
  );
}

function RefundConfirmationModal({
  row,
  isRefunding,
  transferableMilliDollars,
  onConfirm,
  onCancel,
}: {
  row: TransactionHistoryRow;
  isRefunding: boolean;
  transferableMilliDollars: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const creditAmount = row.checkout_session_amount_milli_dollars ?? 0;
  const creditsSpent = Math.max(0, creditAmount - transferableMilliDollars);
  const creditsToDeduct = Math.min(creditAmount, transferableMilliDollars);

  return (
    <Modal show centered onHide={isRefunding ? undefined : onCancel}>
      <Modal.Header closeButton={!isRefunding}>
        <Modal.Title>Confirm refund</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Are you sure you want to refund this credit purchase?</p>
        {creditsSpent > 0 && (
          <div className="alert alert-warning">
            <p className="mb-2">
              The current transferable balance is {formatMilliDollars(transferableMilliDollars)},
              which is less than the original purchase of {formatMilliDollars(creditAmount)}.
            </p>
            <div>
              {formatMilliDollars(creditsToDeduct)} will be deducted from the transferable balance.
            </div>
            <div>{formatMilliDollars(creditAmount)} will be refunded via Stripe.</div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={isRefunding} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" disabled={isRefunding} onClick={onConfirm}>
          {isRefunding ? 'Processing...' : 'Confirm refund'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
