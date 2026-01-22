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

export function ZoneHeader({
  zone,
  zoneNumber,
  nTableCols,
  editMode,
  handleAddQuestion,
  handleEditZone,
  handleDeleteZone,
}: {
  zone: ZoneAssessmentJson;
  zoneNumber: number;
  nTableCols: number;
  editMode?: boolean;
  handleAddQuestion?: (zoneNumber: number) => void;
  handleEditZone?: (zoneNumber: number) => void;
  handleDeleteZone?: (zoneNumber: number) => void;
}) {
  return (
    <tr>
      <th colSpan={nTableCols + 1}>
        <div className="d-flex justify-content-between align-items-center">
          <div>
            Zone {zoneNumber}. {zone.title}{' '}
            {zone.numberChoose == null
              ? '(Choose all questions)'
              : zone.numberChoose === 1
                ? '(Choose 1 question)'
                : `(Choose ${zone.numberChoose} questions)`}
            {zone.maxPoints != null ? ` (maximum ${zone.maxPoints} points)` : ''}
            {zone.bestQuestions != null ? ` (best ${zone.bestQuestions} questions)` : ''}
          </div>
          {editMode && (
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-outline-secondary border-0"
                type="button"
                title="Edit zone"
                onClick={() => handleEditZone?.(zoneNumber)}
              >
                <i className="fa fa-edit" aria-hidden="true" />
              </button>
              <button
                className="btn btn-sm btn-outline-secondary border-0"
                type="button"
                title="Delete zone"
                onClick={() => handleDeleteZone?.(zoneNumber)}
              >
                <i className="fa fa-trash text-danger" aria-hidden="true" />
              </button>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                onClick={() => handleAddQuestion?.(zoneNumber)}
              >
                <i className="fa fa-add" aria-hidden="true" /> Add question
              </button>
            </div>
          )}
        </div>
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
      <td colSpan={nTableCols}>
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
    <span className="ms-3">
      {alternativeGroupNumber}.{numberInAlternativeGroup}.{' '}
    </span>
  );
}
