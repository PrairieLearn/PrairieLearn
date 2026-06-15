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
            <div className="d-flex align-items-center">
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
              {question.zone.lockpoint ? (
                <span className="badge text-bg-warning ms-2">
                  <i className="bi bi-lock-fill me-1" aria-hidden="true" />
                  Lockpoint
                </span>
              ) : null}
            </div>
          </th>
        </tr>
      ) : (
        ''
      )}
      {question.start_new_alternative_pool && question.alternative_pool_size > 1 ? (
        <tr>
          <td colSpan={nTableCols}>
            {question.alternative_pool.number}.{' '}
            {question.alternative_pool.number_choose == null
              ? 'Choose all questions from:'
              : question.alternative_pool.number_choose === 1
                ? 'Choose 1 question from:'
                : `Choose ${question.alternative_pool.number_choose} questions from:`}
          </td>
        </tr>
      ) : (
        ''
      )}
    </>
  );
}

/**
 * Renders a question number badge such as "3." or "3.2.".
 */
export function AssessmentQuestionNumber({
  questionNumber,
  alternativeNumber,
  className,
}: {
  questionNumber: number;
  alternativeNumber?: number | null;
  className?: string;
}) {
  return (
    <span className={className} style={{ fontVariant: 'tabular-nums' }}>
      {alternativeNumber != null ? `${questionNumber}.${alternativeNumber}.` : `${questionNumber}.`}
    </span>
  );
}
