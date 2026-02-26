import type { StaffAssessmentQuestionRow } from '../lib/assessment-question.shared.js';

export function AssessmentQuestionHeaders({
  question,
  nTableCols,
}: {
  question: StaffAssessmentQuestionRow;
  nTableCols: number;
}) {
  return (
    <>
      {question.start_new_zone ? (
        <tr>
          <th colSpan={nTableCols}>
            Zone {question.zone.number}. {question.zone.title}{' '}
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
          <td colSpan={nTableCols}>
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

/**
 * Renders the question number badge for public assessment questions.
 */
export function AssessmentQuestionNumber({
  alternativeGroupSize,
  alternativeGroupNumber,
  numberInAlternativeGroup,
}: {
  alternativeGroupSize: number;
  alternativeGroupNumber: number;
  numberInAlternativeGroup: number | null;
}) {
  const numberText =
    alternativeGroupSize === 1
      ? `${alternativeGroupNumber}.`
      : `${alternativeGroupNumber}.${numberInAlternativeGroup}.`;

  return <span className="badge color-gray1 me-2">{numberText} </span>;
}
