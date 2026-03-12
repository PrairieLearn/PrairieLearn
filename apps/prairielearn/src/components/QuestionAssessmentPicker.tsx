import { html } from '@prairielearn/html';

import type { AssessmentForPicker } from '../lib/assessment-question-context.js';

export function QuestionAssessmentPicker({
  assessments,
  selectedAssessmentQuestionId,
  currentPath,
  urlPrefix,
}: {
  assessments: AssessmentForPicker[];
  selectedAssessmentQuestionId: string | null;
  currentPath: string;
  urlPrefix: string;
}) {
  return html`
    <div class="card mb-3">
      <div class="card-header bg-secondary text-white">Assessment context</div>
      ${assessments.length === 0
        ? html`
            <div class="card-body text-muted">
              This question is not used in any assessments in this course instance.
            </div>
          `
        : html`
            <div class="list-group list-group-flush">
              ${assessments.map(
                (assessment) => html`
                  <a
                    href="${urlPrefix}/${currentPath}?assessment_question_id=${assessment.assessment_question_id}"
                    class="list-group-item list-group-item-action${selectedAssessmentQuestionId ===
                    assessment.assessment_question_id
                      ? ' active'
                      : ''}"
                  >
                    <span class="badge color-${assessment.assessment_color}">
                      ${assessment.assessment_label}
                    </span>
                  </a>
                `,
              )}
            </div>
            ${selectedAssessmentQuestionId != null
              ? html`
                  <div class="card-footer">
                    <a href="${urlPrefix}/${currentPath}">Clear</a>
                  </div>
                `
              : ''}
          `}
    </div>
  `;
}
