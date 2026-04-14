import { formatDate } from '@prairielearn/formatter';

import type { StudentQuestionRow } from './types.js';

export function LockpointRow({
  row,
  colspan,
  crossable,
  blockedByAdvanceScorePerc,
  isGroupAssessment,
  displayTimezone,
  onCrossLockpoint,
}: {
  row: StudentQuestionRow;
  colspan: number;
  crossable: boolean;
  blockedByAdvanceScorePerc: boolean;
  isGroupAssessment: boolean;
  displayTimezone: string;
  onCrossLockpoint: (zoneId: string) => void;
}) {
  if (row.lockpoint_crossed) {
    const parts: string[] = ['Previous questions locked'];
    if (isGroupAssessment && row.lockpoint_crossed_authn_user_uid) {
      parts.push(`by ${row.lockpoint_crossed_authn_user_uid}`);
    }
    if (row.lockpoint_crossed_at) {
      parts.push(`at ${formatDate(row.lockpoint_crossed_at, displayTimezone)}`);
    }

    return (
      <tr className="table-light">
        <td colSpan={colspan} className="py-2">
          <div className="d-flex">
            <i className="fas fa-check-circle text-success me-2 mt-1" aria-hidden="true" />
            <div>
              <span className="fw-bold">Lockpoint</span>
              <small className="text-muted d-block">{parts.join(' ')}</small>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  if (crossable) {
    return (
      <tr className="table-warning">
        <td colSpan={colspan} className="py-2">
          <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
            <div className="d-flex">
              <i className="fas fa-lock text-warning me-2 mt-1" aria-hidden="true" />
              <div>
                <span className="fw-bold">Lockpoint</span>
                <small className="text-muted d-block">
                  After proceeding, you will not be able to submit answers to previous questions.
                </small>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-warning btn-sm text-nowrap"
              onClick={() => onCrossLockpoint(row.zone.id)}
            >
              Proceed to next questions
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="table-light">
      <td colSpan={colspan} className="py-2">
        <div className="d-flex">
          <i className="fas fa-lock text-secondary me-2 mt-1" aria-hidden="true" />
          <div>
            <span className="fw-bold text-muted">Lockpoint</span>
            <small className="text-muted d-block">
              {blockedByAdvanceScorePerc
                ? 'A previous question requires a higher score before you can proceed past this lockpoint.'
                : 'Complete previous questions to unlock.'}
            </small>
          </div>
        </div>
      </td>
    </tr>
  );
}
