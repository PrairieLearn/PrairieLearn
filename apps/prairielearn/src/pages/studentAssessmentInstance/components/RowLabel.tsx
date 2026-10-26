import { html } from '@prairielearn/html';

import { getInstanceQuestionUrl } from '../../../lib/client/url.js';
import type { InstanceQuestionRow } from '../studentAssessmentInstance.types.js';

export function RowLabel({
  courseInstanceId,
  row,
  userGroupRoles,
  rowLabelText,
  hasStatusColumn,
}: {
  courseInstanceId: string;
  row: InstanceQuestionRow;
  userGroupRoles: string | null;
  rowLabelText: string;
  hasStatusColumn: boolean;
}) {
  let lockMessage: string | null = null;
  let showLink = true;

  if (row.question_access_mode === 'blocked_sequence') {
    showLink = false;
    lockMessage =
      row.prev_question_access_mode === 'blocked_sequence'
        ? 'A previous question must be completed before you can access this one.'
        : `You must score at least ${row.prev_advance_score_perc}% on ${row.prev_title} to unlock this question.`;
  } else if (row.question_access_mode === 'blocked_lockpoint') {
    showLink = false;
  } else if (!(row.group_role_permissions?.can_view ?? true)) {
    showLink = false;
    lockMessage = `Your current group role (${userGroupRoles}) restricts access to this question.`;
  } else if (row.question_access_mode === 'read_only_lockpoint') {
    lockMessage =
      'You can no longer submit answers to this question because you have advanced past a lockpoint.';
  }

  return html`
    ${
      showLink
        ? html`
            <a
              href="${getInstanceQuestionUrl({
                courseInstanceId,
                instanceQuestionId: row.instance_question.id,
              })}"
              >${rowLabelText}</a
            >
          `
        : html`<span class="text-muted">${rowLabelText}</span>`
    }
    ${
      // On exams, blocked_lockpoint questions show "Locked" in the Status column,
      // so we skip the inline badge to avoid duplication. On homeworks (no Status
      // column), we render the badge here instead.
      row.question_access_mode === 'blocked_lockpoint' && !hasStatusColumn
        ? html`
            <span class="badge bg-secondary ms-1" data-testid="locked-instance-question-row">
              Locked
            </span>
          `
        : lockMessage != null
          ? html`
              <span
                class="d-block small lh-sm text-muted mt-1"
                data-testid="locked-instance-question-row"
              >
                ${lockMessage}
              </span>
            `
          : ''
    }
    ${
      row.file_count > 0
        ? html`
            <span class="small text-muted ms-1">
              Personal notes: ${row.file_count}
              ${row.file_count === 1 ? 'attachment' : 'attachments'}
            </span>
          `
        : ''
    }
  `;
}
