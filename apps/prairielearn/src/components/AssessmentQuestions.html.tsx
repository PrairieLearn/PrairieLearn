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
            Zone {question.zone.number}. {question.zone.title}
            {question.zone.number_choose == null
              ? '(Choose all questions)'
              : question.zone.number_choose === 1
                ? '(Choose 1 question)'
                : `(Choose ${question.zone.number_choose} questions)`}
            {question.zone.max_points != null
              ? ` (maximum ${question.zone.max_points} points)`
              : ''}
            {question.zone.best_questions != null
              ? ` (best ${question.zone.best_questions} questions)`
              : ''}
          </th>
        </tr>
      ) : (
        ''
      )}
      {question.start_new_alternative_group && question.alternative_group_size > 1 ? (
        <tr>
          <td colspan={nTableCols}>
            {question.alternative_group.number}.{' '}
            {question.alternative_group.number_choose == null
              ? 'Choose all questions from:'
              : question.alternative_group.number_choose === 1
                ? 'Choose 1 question from:'
                : `Choose ${question.alternative_group.number_choose} questions from:`}
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
    <>{question.alternative_group.number}. </>
  ) : (
    <span class="ms-3">
      {question.alternative_group.number}.{question.number_in_alternative_group}.{' '}
    </span>
  );
}
