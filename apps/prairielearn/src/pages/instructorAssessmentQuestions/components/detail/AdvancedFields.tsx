import type { UseFormRegister } from 'react-hook-form';

import { coerceToNumber } from '../../utils/formHelpers.js';

const HELP_TEXT = {
  advanceScorePerc: {
    question: 'Minimum score percentage required to unlock the next question.',
    altGroup: 'Minimum score percentage required to advance past this group.',
    zone: 'Minimum score percentage required to advance past this zone.',
  },
  gradeRateMinutes: {
    question: 'Minimum time between grading attempts.',
    altGroup: 'Minimum time between grading attempts for questions in this group.',
    zone: 'Minimum time between grading attempts for questions in this zone.',
  },
  allowRealTimeGrading: {
    question: 'Let students see grading results immediately after submission.',
    altGroup: 'Let students see grading results immediately after submission.',
    zone: 'Let students see grading results immediately for questions in this zone.',
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
            Award full points after enough attempts, regardless of correctness.
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
