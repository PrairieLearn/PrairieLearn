import { type HtmlSafeString, html } from '@prairielearn/html';

import { type AssessmentQuestionRow } from '../models/assessment-question.js';

export function AssessmentQuestionHeaders(
  question: AssessmentQuestionRow,
  nTableCols: number,
): HtmlSafeString {
  return html`${question.start_new_zone
    ? html`
        <tr>
          <th colspan="${nTableCols}">
            Zone ${question.zone_number}. ${question.zone_title}
            ${question.zone_number_choose == null
              ? '(Choose all questions)'
              : question.zone_number_choose === 1
                ? '(Choose 1 question)'
                : `(Choose ${question.zone_number_choose} questions)`}
            ${question.zone_has_max_points ? `(maximum ${question.zone_max_points} points)` : ''}
            ${question.zone_has_best_questions
              ? `(best ${question.zone_best_questions} questions)`
              : ''}
          </th>
        </tr>
      `
    : ''}
  ${question.start_new_alternative_group && question.alternative_group_size > 1
    ? html`
        <tr>
          <td colspan="${nTableCols}">
            ${question.alternative_group_number}.
            ${question.alternative_group_number_choose == null
              ? 'Choose all questions from:'
              : question.alternative_group_number_choose === 1
                ? 'Choose 1 question from:'
                : `Choose ${question.alternative_group_number_choose} questions from:`}
          </td>
        </tr>
      `
    : ''}`;
}

export function AssessmentQuestionNumber(question: AssessmentQuestionRow): HtmlSafeString {
  return question.alternative_group_size === 1
    ? html`${question.alternative_group_number}.`
    : html`
        <span class="ms-3">
          ${question.alternative_group_number}.${question.number_in_alternative_group}.
        </span>
      `;
}
