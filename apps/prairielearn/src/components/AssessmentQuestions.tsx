import type { StaffAssessmentQuestionRow } from '../lib/assessment-question.js';
import type {
  StaffAlternativeGroup,
  StaffAssessmentQuestion,
} from '../lib/client/safe-db-types.js';
import type { AlternativeGroup, AssessmentQuestion } from '../lib/db-types.js';

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
          <th colspan={nTableCols}>
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

export function AssessmentQuestionNumber({
  alternativeGroup,
  alternativeGroupSize,
  assessmentQuestion,
}: {
  alternativeGroup: AlternativeGroup | StaffAlternativeGroup;
  alternativeGroupSize: number;
  assessmentQuestion: AssessmentQuestion | StaffAssessmentQuestion;
}) {
  return alternativeGroupSize === 1 ? (
    `${alternativeGroup.number}. `
  ) : (
    <span className="ms-3">
      {alternativeGroup.number}.{assessmentQuestion.number_in_alternative_group}.{' '}
    </span>
  );
}
