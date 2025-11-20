import type { StaffAssessmentQuestionRow } from '../lib/assessment-question.js';
import type { ZoneAssessmentJson, ZoneQuestionJson } from '../schemas/infoAssessment.js';

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

export function ZoneHeader({
  zone,
  zoneNumber,
  nTableCols,
}: {
  zone: ZoneAssessmentJson;
  zoneNumber: number;
  nTableCols: number;
}) {
  return (
    <tr>
      <th colspan={nTableCols + 1}>
        Zone {zoneNumber}. {zone.title}{' '}
        {zone.numberChoose == null
          ? '(Choose all questions)'
          : zone.numberChoose === 1
            ? '(Choose 1 question)'
            : `(Choose ${zone.numberChoose} questions)`}
        {zone.maxPoints != null ? ` (maximum ${zone.maxPoints} points)` : ''}
        {zone.bestQuestions != null ? ` (best ${zone.bestQuestions} questions)` : ''}
      </th>
    </tr>
  );
}

export function AlternativeGroupHeader({
  alternativeGroup,
  alternativeGroupNumber,
  nTableCols,
}: {
  alternativeGroup: ZoneQuestionJson;
  alternativeGroupNumber: number;
  nTableCols: number;
}) {
  return (
    <tr>
      <td colspan={nTableCols}>
        {alternativeGroupNumber}.{' '}
        {alternativeGroup.numberChoose == null
          ? 'Choose all questions from:'
          : alternativeGroup.numberChoose === 1
            ? 'Choose 1 question from:'
            : `Choose ${alternativeGroup.numberChoose} questions from:`}
      </td>
    </tr>
  );
}

export function AssessmentQuestionNumber({
  alternativeGroupSize,
  alternativeGroupNumber,
  numberInAlternativeGroup,
}: {
  alternativeGroupSize: number;
  alternativeGroupNumber: number;
  numberInAlternativeGroup: number | null;
}) {
  return alternativeGroupSize === 1 ? (
    `${alternativeGroupNumber}. `
  ) : (
    <span class="ms-3">
      {alternativeGroupNumber}.{numberInAlternativeGroup}.{' '}
    </span>
  );
}
