import type { UseFormRegister } from 'react-hook-form';

import { coerceToNumber } from '../../utils/formHelpers.js';

const HELP_TEXT = {
  advanceScorePerc: {
    question: 'Minimum score percentage required to unlock the next question.',
    altGroup: 'Default minimum score percentage to unlock the next question.',
    zone: 'Default minimum score percentage to unlock the next question.',
  },
  gradeRateMinutes: {
    question: 'Minimum time between grading attempts.',
    altGroup: 'Minimum time between grading attempts for questions in this group.',
    zone: 'Minimum time between grading attempts for questions in this zone.',
  },
  allowRealTimeGrading: {
    question: 'Allow students to see grading results during the exam (Exams only).',
    altGroup: 'Allow students to see grading results during the exam (Exams only).',
    zone: 'Allow students to see grading results during the exam for questions in this zone (Exams only).',
  },
} as const;

export function AdvancedFields({
  register,
  idPrefix,
  variant,
}: {
  register: UseFormRegister<any>;
  idPrefix: string;
  variant: 'question' | 'altGroup' | 'zone';
}) {
  return (
    <>
      <h6 className="text-muted text-uppercase small mb-3 mt-4">Advanced</h6>

      <div className="mb-3">
        <label htmlFor={`${idPrefix}-advanceScorePerc`} className="form-label">
          Advance score %
        </label>
        <input
          type="number"
          className="form-control form-control-sm"
          id={`${idPrefix}-advanceScorePerc`}
          {...register('advanceScorePerc', {
            setValueAs: coerceToNumber,
          })}
        />
        <small className="form-text text-muted">{HELP_TEXT.advanceScorePerc[variant]}</small>
      </div>
      <div className="mb-3">
        <label htmlFor={`${idPrefix}-gradeRateMinutes`} className="form-label">
          Grade rate (minutes)
        </label>
        <input
          type="number"
          className="form-control form-control-sm"
          id={`${idPrefix}-gradeRateMinutes`}
          step="any"
          {...register('gradeRateMinutes', {
            setValueAs: coerceToNumber,
          })}
        />
        <small className="form-text text-muted">{HELP_TEXT.gradeRateMinutes[variant]}</small>
      </div>
      {variant !== 'zone' && (
        <div className="mb-3 form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id={`${idPrefix}-forceMaxPoints`}
            {...register('forceMaxPoints')}
          />
          <label htmlFor={`${idPrefix}-forceMaxPoints`} className="form-check-label">
            Force max points
          </label>
          <small className="form-text text-muted d-block">
            Award maximum points when the assessment is regraded. Used to fix broken questions.
          </small>
        </div>
      )}
      <div className="mb-3 form-check">
        <input
          type="checkbox"
          className="form-check-input"
          id={`${idPrefix}-allowRealTimeGrading`}
          {...register('allowRealTimeGrading')}
        />
        <label htmlFor={`${idPrefix}-allowRealTimeGrading`} className="form-check-label">
          Allow real-time grading
        </label>
        <small className="form-text text-muted d-block">
          {HELP_TEXT.allowRealTimeGrading[variant]}
        </small>
      </div>
    </>
  );
}
