import { type HtmlValue, html } from '@prairielearn/html';

export function QuestionNavSideGroup({
  urlPrefix,
  prevInstanceQuestionId,
  nextInstanceQuestionId,
  sequenceLocked,
  prevTeamRolePermissions,
  nextTeamRolePermissions,
  advanceScorePerc,
  userTeamRoles,
}: {
  urlPrefix: string;
  prevInstanceQuestionId: string;
  nextInstanceQuestionId: string;
  sequenceLocked: boolean | null;
  prevTeamRolePermissions: { can_view?: boolean } | null;
  nextTeamRolePermissions: { can_view?: boolean } | null;
  advanceScorePerc: number | null;
  userTeamRoles: string | null;
}) {
  return html`
    <div class="text-center mb-2">
      ${QuestionNavSideButton({
        instanceQuestionId: prevInstanceQuestionId,
        urlPrefix,
        whichButton: 'previous',
        teamRolePermissions: prevTeamRolePermissions,
        userTeamRoles,
      })}
      ${QuestionNavSideButton({
        instanceQuestionId: nextInstanceQuestionId,
        sequenceLocked,
        urlPrefix,
        whichButton: 'next',
        teamRolePermissions: nextTeamRolePermissions,
        advanceScorePerc,
        userTeamRoles,
      })}
    </div>
  `;
}

export function QuestionNavSideButton({
  instanceQuestionId,
  sequenceLocked,
  urlPrefix,
  whichButton,
  teamRolePermissions,
  advanceScorePerc,
  userTeamRoles,
}: {
  instanceQuestionId: string | null;
  sequenceLocked?: boolean | null;
  teamRolePermissions: { can_view?: boolean } | null;
  whichButton: 'next' | 'previous';
  urlPrefix: string;
  advanceScorePerc?: number | null;
  userTeamRoles: string | null;
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

  if (teamRolePermissions?.can_view === false) {
    disabledExplanation = html`Your current group role (${userTeamRoles}) restricts access to the
    ${buttonLabel.toLowerCase()}.`;
  } else if (sequenceLocked) {
    disabledExplanation = html`You must score at least <b>${advanceScorePerc}%</b> on a submission
      to this question in order to unlock the next. If you run out of attempts, the next question
      will unlock automatically.`;
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
