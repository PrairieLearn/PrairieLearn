import { type HtmlValue, html } from '@prairielearn/html';

type QuestionAccessMode =
  | 'default'
  | 'blocked_sequence'
  | 'blocked_lockpoint'
  | 'read_only_lockpoint';

export function QuestionNavSideGroup({
  urlPrefix,
  prevInstanceQuestionId,
  nextInstanceQuestionId,
  nextQuestionAccessMode,
  prevGroupRolePermissions,
  nextGroupRolePermissions,
  advanceScorePerc,
  userGroupRoles,
}: {
  urlPrefix: string;
  prevInstanceQuestionId: string;
  nextInstanceQuestionId: string;
  nextQuestionAccessMode: QuestionAccessMode | null;
  prevGroupRolePermissions: { can_view?: boolean } | null;
  nextGroupRolePermissions: { can_view?: boolean } | null;
  advanceScorePerc: number | null;
  userGroupRoles: string | null;
}) {
  return html`
    <div class="text-center mb-2">
      ${QuestionNavSideButton({
        instanceQuestionId: prevInstanceQuestionId,
        urlPrefix,
        whichButton: 'previous',
        groupRolePermissions: prevGroupRolePermissions,
        userGroupRoles,
      })}
      ${QuestionNavSideButton({
        instanceQuestionId: nextInstanceQuestionId,
        nextQuestionAccessMode,
        urlPrefix,
        whichButton: 'next',
        groupRolePermissions: nextGroupRolePermissions,
        advanceScorePerc,
        userGroupRoles,
      })}
    </div>
  `;
}

export function QuestionNavSideButton({
  instanceQuestionId,
  nextQuestionAccessMode,
  urlPrefix,
  whichButton,
  groupRolePermissions,
  advanceScorePerc,
  userGroupRoles,
}: {
  instanceQuestionId: string | null;
  nextQuestionAccessMode?: QuestionAccessMode | null;
  groupRolePermissions: { can_view?: boolean } | null;
  whichButton: 'next' | 'previous';
  urlPrefix: string;
  advanceScorePerc?: number | null;
  userGroupRoles: string | null;
}) {
  const { buttonId, buttonLabel } =
    whichButton === 'next'
      ? { buttonId: 'question-nav-next', buttonLabel: 'Next question' }
      : { buttonId: 'question-nav-prev', buttonLabel: 'Previous question' };
  let disabledExplanation: HtmlValue | null = null;

  if (instanceQuestionId == null) {
    return html`
      <button id="${buttonId}" class="btn btn-primary mb-3 disabled" disabled>
        ${buttonLabel}
      </button>
    `;
  }

  if (groupRolePermissions?.can_view === false) {
    disabledExplanation = html`Your current group role (${userGroupRoles}) restricts access to the
    ${buttonLabel.toLowerCase()}.`;
  } else if (nextQuestionAccessMode === 'blocked_sequence') {
    disabledExplanation = html`You must score at least <b>${advanceScorePerc}%</b> on a submission
      to this question in order to unlock the next. If you run out of attempts, the next question
      will unlock automatically.`;
  } else if (nextQuestionAccessMode === 'blocked_lockpoint') {
    disabledExplanation = html`You must cross the lockpoint on the assessment overview page before
    you can proceed to the next question.`;
  }

  if (disabledExplanation != null) {
    return html`
      <button
        id="${buttonId}"
        class="btn btn-secondary mb-3 pl-sequence-locked"
        data-bs-toggle="popover"
        data-bs-container="body"
        data-bs-html="true"
        data-bs-content="${disabledExplanation}"
      >
        ${buttonLabel}
        <i class="fas fa-lock ms-1" aria-label="Locked"></i>
      </button>
    `;
  }

  return html`
    <a
      id="${buttonId}"
      class="btn btn-primary mb-3"
      href="${urlPrefix}/instance_question/${instanceQuestionId}/"
    >
      ${buttonLabel}
    </a>
  `;
}
