import { html } from '@prairielearn/html';

import type { Assessment, AssessmentQuestion } from '../lib/db-types.js';
import { formatPoints, formatPointsOrList } from '../lib/format.js';

export function AssessmentQuestionConfigPanel({
  assessment_question,
  assessment,
  numberInAlternativeGroup,
}: {
  assessment_question: AssessmentQuestion;
  assessment: Assessment;
  numberInAlternativeGroup: string;
}) {
  const isHomework = assessment.type === 'Homework';

  return html`
    <div class="card mb-3">
      <div class="card-header bg-info text-white">
        <h2>Assessment configuration</h2>
      </div>
      <ul class="list-group list-group-flush">
        <li class="list-group-item d-flex">
          <strong class="me-auto">Question number</strong>
          ${numberInAlternativeGroup}
        </li>
        ${assessment_question.max_auto_points != null
          ? html`
              <li class="list-group-item d-flex">
                <strong class="me-auto">Max auto points</strong>
                ${formatPoints(assessment_question.max_auto_points)}
              </li>
            `
          : ''}
        ${assessment_question.max_manual_points != null && assessment_question.max_manual_points > 0
          ? html`
              <li class="list-group-item d-flex">
                <strong class="me-auto">Max manual points</strong>
                ${formatPoints(assessment_question.max_manual_points)}
              </li>
            `
          : ''}
        ${!isHomework && assessment_question.points_list != null
          ? html`
              <li class="list-group-item d-flex">
                <strong class="me-auto">Points list</strong>
                ${formatPointsOrList(assessment_question.points_list)}
              </li>
            `
          : ''}
        ${isHomework && assessment_question.init_points != null
          ? html`
              <li class="list-group-item d-flex">
                <strong class="me-auto">Init points</strong>
                ${formatPoints(assessment_question.init_points)}
              </li>
            `
          : ''}
        ${isHomework && assessment_question.max_points != null
          ? html`
              <li class="list-group-item d-flex">
                <strong class="me-auto">Max points</strong>
                ${formatPoints(assessment_question.max_points)}
              </li>
            `
          : ''}
        ${assessment_question.tries_per_variant != null
          ? html`
              <li class="list-group-item d-flex">
                <strong class="me-auto">Tries per variant</strong>
                ${assessment_question.tries_per_variant}
              </li>
            `
          : ''}
      </ul>
    </div>
  `;
}
