import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import type { InstanceQuestionRow } from '../studentAssessmentInstance.types.js';

export function LockpointRow({
  row,
  colspan,
  crossable,
  blockedByAdvanceScorePerc,
  isGroupAssessment,
  displayTimezone,
}: {
  row: InstanceQuestionRow;
  colspan: number;
  crossable: boolean;
  blockedByAdvanceScorePerc: boolean;
  isGroupAssessment: boolean;
  displayTimezone: string;
}) {
  if (row.lockpoint_crossed) {
    return html`
      <tr class="table-light">
        <td colspan="${colspan}" class="py-2">
          <div class="d-flex">
            <i class="fas fa-check-circle text-success me-2 mt-1" aria-hidden="true"></i>
            <div>
              <span class="fw-bold">Lockpoint</span>
              <small class="text-muted d-block">
                Previous questions
                locked${isGroupAssessment && row.lockpoint_crossed_authn_user_uid
                  ? html` by ${row.lockpoint_crossed_authn_user_uid}`
                  : ''}${row.lockpoint_crossed_at
                  ? html` at ${formatDate(row.lockpoint_crossed_at, displayTimezone)}`
                  : ''}
              </small>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  if (crossable) {
    return html`
      <tr class="table-warning">
        <td colspan="${colspan}" class="py-2">
          <div
            class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2"
          >
            <div class="d-flex">
              <i class="fas fa-lock text-warning me-2 mt-1" aria-hidden="true"></i>
              <div>
                <span class="fw-bold">Lockpoint</span>
                <small class="text-muted d-block">
                  After proceeding, you will not be able to submit answers to previous questions.
                </small>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-warning btn-sm text-nowrap"
              data-bs-toggle="modal"
              data-bs-target="#crossLockpointModal-${row.zone_id}"
            >
              Proceed to next questions
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  return html`
    <tr class="table-light">
      <td colspan="${colspan}" class="py-2">
        <div class="d-flex">
          <i class="fas fa-lock text-secondary me-2 mt-1" aria-hidden="true"></i>
          <div>
            <span class="fw-bold text-muted">Lockpoint</span>
            <small class="text-muted d-block">
              ${blockedByAdvanceScorePerc
                ? 'A previous question requires a higher score before you can proceed past this lockpoint.'
                : 'Complete previous questions to unlock.'}
            </small>
          </div>
        </div>
      </td>
    </tr>
  `;
}
