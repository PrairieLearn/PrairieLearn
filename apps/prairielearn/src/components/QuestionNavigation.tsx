import { type HtmlValue, html } from '@prairielearn/html';

type QuestionAccessMode =
  'default' | 'blocked_sequence' | 'blocked_lockpoint' | 'read_only_lockpoint';

export function QuestionNavSideGroup({
  urlPrefix,
  assessmentInstanceId,
  prevInstanceQuestionId,
  nextInstanceQuestionId,
  nextQuestionAccessMode,
  prevGroupRolePermissions,
  nextGroupRolePermissions,
  advanceScorePerc,
  userGroupRoles,
}: {
  urlPrefix: string;
  assessmentInstanceId: string;
  prevInstanceQuestionId: string | null;
  nextInstanceQuestionId: string | null;
  nextQuestionAccessMode: QuestionAccessMode | null;
  prevGroupRolePermissions: { can_view?: boolean } | null | undefined;
  nextGroupRolePermissions: { can_view?: boolean } | null | undefined;
  advanceScorePerc: number | null;
  userGroupRoles: string | null;
}) {
  return html`
    <div class="text-center mb-2">
      ${QuestionNavSideButton({
        instanceQuestionId: prevInstanceQuestionId,
        urlPrefix,
        assessmentInstanceId,
        whichButton: 'previous',
        groupRolePermissions: prevGroupRolePermissions,
        userGroupRoles,
      })}
      ${QuestionNavSideButton({
        instanceQuestionId: nextInstanceQuestionId,
        nextQuestionAccessMode,
        urlPrefix,
        assessmentInstanceId,
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
  assessmentInstanceId,
  whichButton,
  groupRolePermissions,
  advanceScorePerc,
  userGroupRoles,
}: {
  instanceQuestionId: string | null;
  nextQuestionAccessMode?: QuestionAccessMode | null;
  groupRolePermissions: { can_view?: boolean } | null | undefined;
  whichButton: 'next' | 'previous';
  urlPrefix: string;
  assessmentInstanceId: string;
  advanceScorePerc?: number | null;
  userGroupRoles: string | null;
}) {
  const { buttonId, buttonLabel } =
    whichButton === 'next'
      ? { buttonId: 'question-nav-next', buttonLabel: 'Next question' }
      : { buttonId: 'question-nav-prev', buttonLabel: 'Previous question' };
  let disabledExplanation: HtmlValue | null = null;

  if (instanceQuestionId != null) {
    if (groupRolePermissions?.can_view === false) {
      disabledExplanation = html`Your current group role (${userGroupRoles}) restricts access to the
      ${buttonLabel.toLowerCase()}.`;
    } else if (nextQuestionAccessMode === 'blocked_sequence') {
      disabledExplanation = html`You must score at least <b>${advanceScorePerc}%</b> on a submission
        to this question in order to unlock the next. If you run out of attempts, the next question
        will unlock automatically.`;
    } else if (nextQuestionAccessMode === 'blocked_lockpoint') {
      disabledExplanation = html`Cross the lockpoint on
        <a href="${urlPrefix}/assessment_instance/${assessmentInstanceId}/">the assessment page</a>
        to proceed to the next question.`;
    }
  }

  return html`
    <span
      id="${buttonId}-container"
      class="d-inline-block align-top mx-1 mb-3"
      style="max-width: 22rem"
    >
      ${
        instanceQuestionId == null || disabledExplanation != null
          ? html`
              <button
                id="${buttonId}"
                type="button"
                class="btn ${
                  disabledExplanation != null ? 'btn-secondary pl-sequence-locked' : 'btn-primary'
                }"
                disabled
              >
                ${buttonLabel}
                ${
                  disabledExplanation != null
                    ? html`<i class="fas fa-lock ms-1" aria-hidden="true"></i>`
                    : ''
                }
              </button>
            `
          : html`
              <a
                id="${buttonId}"
                class="btn btn-primary"
                href="${urlPrefix}/instance_question/${instanceQuestionId}/"
              >
                ${buttonLabel}
              </a>
            `
      }
      ${
        disabledExplanation != null
          ? html`
              <span id="${buttonId}-reason" class="d-block small lh-sm text-muted mt-2">
                ${disabledExplanation}
              </span>
            `
          : ''
      }
    </span>
  `;
}
