import { HtmlValue, html } from '@prairielearn/html';

export function QuestionNavSideGroup({
  urlPrefix,
  prevInstanceQuestionId,
  nextInstanceQuestionId,
  sequenceLocked,
  prevGroupRolePermissions,
  nextGroupRolePermissions,
  advanceScorePerc,
  userGroupRoles,
}: {
  urlPrefix: string;
  prevInstanceQuestionId: string;
  nextInstanceQuestionId: string;
  sequenceLocked: boolean | null;
  prevGroupRolePermissions: { can_view?: boolean } | null;
  nextGroupRolePermissions: { can_view?: boolean } | null;
  advanceScorePerc: number | null;
  userGroupRoles: string | null;
}) {
  return html`
    <div class="text-center mb-2">
      ${QuestionNavSideButton({
        questionId: prevInstanceQuestionId,
        urlPrefix,
        button: { id: 'question-nav-prev', label: 'Previous question' },
        groupRolePermissions: prevGroupRolePermissions,
        userGroupRoles,
      })}
      ${QuestionNavSideButton({
        // NOTE: This must be kept in sync the the corresponding code in
        // `lib/question-render.js`.
        questionId: nextInstanceQuestionId,
        sequenceLocked,
        urlPrefix,
        button: { id: 'question-nav-next', label: 'Next question' },
        groupRolePermissions: nextGroupRolePermissions,
        advanceScorePerc,
        userGroupRoles,
      })}
    </div>
  `;
}

export function QuestionNavSideButton({
  questionId,
  sequenceLocked,
  urlPrefix,
  button,
  groupRolePermissions,
  advanceScorePerc,
  userGroupRoles,
}: {
  questionId: string | null;
  sequenceLocked?: boolean | null;
  groupRolePermissions: { can_view?: boolean } | null;
  button: { id: string; label: string };
  urlPrefix: string;
  advanceScorePerc?: number | null;
  userGroupRoles: string | null;
}) {
  const classes = 'btn text-white mb-3';
  let disabledExplanation: HtmlValue | null = null;

  if (questionId == null) {
    return html`
      <button id="${button.id}" class="${classes} btn-primary disabled" disabled>
        ${button.label}
      </button>
    `;
  }

  if (sequenceLocked) {
    disabledExplanation = html`You must score at least <b>${advanceScorePerc}%</b> on a submission
      to this question in order to unlock the next. If you run out of attempts, the next question
      will unlock automatically.`;
  } else if (groupRolePermissions?.can_view === false) {
    disabledExplanation = html`Your current group role (${userGroupRoles}) restricts access to the
    ${button.label.toLowerCase()}.`;
  }

  if (disabledExplanation != null) {
    return html`
      <button
        id="${button.id}"
        class="${classes} btn-secondary pl-sequence-locked"
        data-toggle="popover"
        data-trigger="focus"
        data-container="body"
        data-html="true"
        data-content="${disabledExplanation}"
      >
        ${button.label}
        <i class="fas fa-lock ml-1" aria-label="Locked"></i>
      </button>
    `;
  }

  return html`
    <a
      id="${button.id}"
      class="${classes} btn-primary"
      href="${urlPrefix}/instance_question/${questionId}/"
    >
      ${button.label}
    </a>
  `;
}
