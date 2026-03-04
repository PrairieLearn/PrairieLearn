import clsx from 'clsx';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';

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
  errors,
  idPrefix,
  variant,
}: {
  register: UseFormRegister<any>;
  errors?: FieldErrors;
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
          className={clsx('form-control form-control-sm', errors?.advanceScorePerc && 'is-invalid')}
          id={`${idPrefix}-advanceScorePerc`}
          aria-invalid={!!errors?.advanceScorePerc}
          aria-errormessage={
            errors?.advanceScorePerc ? `${idPrefix}-advanceScorePerc-error` : undefined
          }
          aria-describedby={`${idPrefix}-advanceScorePerc-help`}
          {...register('advanceScorePerc', {
            setValueAs: coerceToNumber,
            validate: (v) => {
              if (v == null) return;
              if (v < 0 || v > 100) return 'Advance score % must be between 0 and 100.';
            },
          })}
        />
        {errors?.advanceScorePerc && (
          <div id={`${idPrefix}-advanceScorePerc-error`} className="invalid-feedback">
            {errors.advanceScorePerc.message as string}
          </div>
        )}
        <small id={`${idPrefix}-advanceScorePerc-help`} className="form-text text-muted">
          {HELP_TEXT.advanceScorePerc[variant]}
        </small>
      </div>
      <div className="mb-3">
        <label htmlFor={`${idPrefix}-gradeRateMinutes`} className="form-label">
          Grade rate (minutes)
        </label>
        <input
          type="number"
          className={clsx('form-control form-control-sm', errors?.gradeRateMinutes && 'is-invalid')}
          id={`${idPrefix}-gradeRateMinutes`}
          aria-invalid={!!errors?.gradeRateMinutes}
          aria-errormessage={
            errors?.gradeRateMinutes ? `${idPrefix}-gradeRateMinutes-error` : undefined
          }
          aria-describedby={`${idPrefix}-gradeRateMinutes-help`}
          step="any"
          {...register('gradeRateMinutes', {
            setValueAs: coerceToNumber,
            validate: (v) => {
              if (v == null) return;
              if (v < 0) return 'Grade rate must be non-negative.';
            },
          })}
        />
        {errors?.gradeRateMinutes && (
          <div id={`${idPrefix}-gradeRateMinutes-error`} className="invalid-feedback">
            {errors.gradeRateMinutes.message as string}
          </div>
        )}
        <small id={`${idPrefix}-gradeRateMinutes-help`} className="form-text text-muted">
          {HELP_TEXT.gradeRateMinutes[variant]}
        </small>
      </div>
      {variant !== 'zone' && (
        <div className="mb-3 form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id={`${idPrefix}-forceMaxPoints`}
            aria-describedby={`${idPrefix}-forceMaxPoints-help`}
            {...register('forceMaxPoints')}
          />
          <label htmlFor={`${idPrefix}-forceMaxPoints`} className="form-check-label">
            Force max points
          </label>
          <small id={`${idPrefix}-forceMaxPoints-help`} className="form-text text-muted d-block">
            Award maximum points when the assessment is regraded. Used to fix broken questions.
          </small>
        </div>
      )}
      <div className="mb-3 form-check">
        <input
          type="checkbox"
          className="form-check-input"
          id={`${idPrefix}-allowRealTimeGrading`}
          aria-describedby={`${idPrefix}-allowRealTimeGrading-help`}
          {...register('allowRealTimeGrading')}
        />
        <label htmlFor={`${idPrefix}-allowRealTimeGrading`} className="form-check-label">
          Allow real-time grading
        </label>
        <small id={`${idPrefix}-allowRealTimeGrading-help`} className="form-text text-muted d-block">
          {HELP_TEXT.allowRealTimeGrading[variant]}
        </small>
      </div>
    </>
  );
}
