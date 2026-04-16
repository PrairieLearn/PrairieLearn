import { html } from '@prairielearn/html';

import { getInstanceQuestionUrl } from '../../../lib/client/url.js';
import type { InstanceQuestionRow } from '../studentAssessmentInstance.types.js';

export function RowLabel({
  courseInstanceId,
  instance_question_row,
  userGroupRoles,
  rowLabelText,
  hasStatusColumn,
}: {
  courseInstanceId: string;
  instance_question_row: InstanceQuestionRow;
  userGroupRoles: string | null;
  rowLabelText: string;
  hasStatusColumn: boolean;
}) {
  let lockMessage: string | null = null;
  let showLink = true;

  if (instance_question_row.question_access_mode === 'blocked_sequence') {
    showLink = false;
    lockMessage =
      instance_question_row.prev_question_access_mode === 'blocked_sequence'
        ? 'A previous question must be completed before you can access this one.'
        : `You must score at least ${instance_question_row.prev_advance_score_perc}% on ${instance_question_row.prev_title} to unlock this question.`;
  } else if (instance_question_row.question_access_mode === 'blocked_lockpoint') {
    showLink = false;
  } else if (!(instance_question_row.group_role_permissions?.can_view ?? true)) {
    showLink = false;
    lockMessage = `Your current group role (${userGroupRoles}) restricts access to this question.`;
  } else if (instance_question_row.question_access_mode === 'read_only_lockpoint') {
    lockMessage =
      'You can no longer submit answers to this question because you have advanced past a lockpoint.';
  }

  return html`
    ${showLink
      ? html`
          <a
            href="${getInstanceQuestionUrl({
              courseInstanceId,
              instanceQuestionId: instance_question_row.id,
            })}"
            >${rowLabelText}</a
          >
        `
      : html`<span class="text-muted">${rowLabelText}</span>`}
    ${
      // On exams, blocked_lockpoint questions show "Locked" in the Status column,
      // so we skip the inline badge to avoid duplication. On homeworks (no Status
      // column), we render the badge here instead.
      instance_question_row.question_access_mode === 'blocked_lockpoint' && !hasStatusColumn
        ? html`
            <span class="badge bg-secondary ms-1" data-testid="locked-instance-question-row">
              Locked
            </span>
          `
        : lockMessage != null
          ? html`
              <button
                type="button"
                class="btn btn-xs border text-secondary ms-1"
                data-bs-toggle="popover"
                data-bs-container="body"
                data-bs-html="true"
                data-bs-content="${lockMessage}"
                data-testid="locked-instance-question-row"
                aria-label="Locked"
              >
                <i class="fas fa-lock" aria-hidden="true"></i>
              </button>
            `
          : ''
    }
    ${instance_question_row.file_count > 0
      ? html`
          <button
            type="button"
            class="btn btn-xs border text-secondary ms-1"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-content="Personal notes: ${instance_question_row.file_count}"
            aria-label="Has personal note attachments"
          >
            <i class="fas fa-paperclip"></i>
          </button>
        `
      : ''}
  `;
}
