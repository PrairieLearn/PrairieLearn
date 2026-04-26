import { formatInterval } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import type { AssessmentQuestion, InstanceQuestion } from '../lib/db-types.js';

export function ExamQuestionStatus({
  instance_question,
  assessment_question,
  realTimeGradingPartiallyDisabled,
  allowGradeLeftMs,
}: {
  instance_question: Pick<InstanceQuestion, 'status'>;
  assessment_question: Pick<
    AssessmentQuestion,
    'max_auto_points' | 'max_manual_points' | 'allow_real_time_grading'
  >;
  /**
   * On exam with mixed real-time grading settings, this flag allows us to
   * differentiate between questions that are saved and which can be graded by
   * clicking the "Grade N saved answers" button and those that cannot
   * (because real-time grading is disabled).
   */
  realTimeGradingPartiallyDisabled?: boolean;
  allowGradeLeftMs: number;
}) {
  // Special case: if this is a manually graded question in the "saved" state,
  // we want to differentiate it from saved auto-graded questions which can
  // be graded immediately. We'll use a green badge so that student can drive
  // towards all status badges being green.
  //
  // TODO: can we safely look at the assessment question for exams? What about
  // the guarantee that an Exam-type assessment won't change after it's created?
  if (
    instance_question.status === 'saved' &&
    !assessment_question.max_auto_points &&
    assessment_question.max_manual_points
  ) {
    return html`<span class="badge text-bg-success">saved for manual grading</span>`;
  }

  const badge_color: Record<NonNullable<InstanceQuestion['status']>, string> = {
    unanswered: 'warning',
    invalid: 'danger',
    grading: 'secondary',
    saved: 'info',
    complete: 'success',
    correct: 'success',
    incorrect: 'danger',
  };

  const { badgeText, badgeColor } = run(() => {
    if (
      realTimeGradingPartiallyDisabled &&
      instance_question.status === 'saved' &&
      !assessment_question.allow_real_time_grading
    ) {
      return { badgeText: 'saved for grading after finish', badgeColor: 'success' };
    }

    return {
      badgeText: instance_question.status,
      badgeColor: badge_color[instance_question.status ?? 'unanswered'],
    };
  });

  return html`
    <span class="badge text-bg-${badgeColor}">${badgeText}</span>
    ${allowGradeLeftMs > 0
      ? html`
          <button
            type="button"
            class="grade-rate-limit-popover btn btn-xs"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-content="This question limits the rate of submissions. Further grade allowed in ${formatInterval(
              allowGradeLeftMs,
              { fullPartNames: true, firstOnly: true },
            )} (as of the loading of this page)."
            data-bs-placement="auto"
          >
            <i class="fa fa-hourglass-half" aria-hidden="true"></i>
          </button>
        `
      : ''}
  `;
}
