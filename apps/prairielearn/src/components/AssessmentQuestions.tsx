import type { AssessmentQuestionRow } from '../models/assessment-question.js';

export function AssessmentQuestionHeaders({
  question,
  nTableCols,
}: {
  question: AssessmentQuestionRow;
  nTableCols: number;
}) {
  return (
    <>
      {question.start_new_zone ? (
        <tr>
          <th colspan={nTableCols}>
            Zone {question.zone_number}. {question.zone_title}
            {question.zone_number_choose == null
              ? '(Choose all questions)'
              : question.zone_number_choose === 1
                ? '(Choose 1 question)'
                : `(Choose ${question.zone_number_choose} questions)`}
            {question.zone_has_max_points ? `(maximum ${question.zone_max_points} points)` : ''}
            {question.zone_has_best_questions
              ? `(best ${question.zone_best_questions} questions)`
              : ''}
          </th>
        </tr>
      ) : (
        ''
      )}
      {question.start_new_alternative_group && question.alternative_group_size > 1 ? (
        <tr>
          <td colspan={nTableCols}>
            {question.alternative_group_number}.{' '}
            {question.alternative_group_number_choose == null
              ? 'Choose all questions from:'
              : question.alternative_group_number_choose === 1
                ? 'Choose 1 question from:'
                : `Choose ${question.alternative_group_number_choose} questions from:`}
          </td>
        </tr>
      ) : (
        ''
      )}
    </>
  );
}

export function AssessmentQuestionNumber({ question }: { question: AssessmentQuestionRow }) {
  return question.alternative_group_size === 1 ? (
    `${question.alternative_group_number}. `
  ) : (
    <span class="ms-3">
      {question.alternative_group_number}.{question.number_in_alternative_group}.{' '}
    </span>
  );
}
