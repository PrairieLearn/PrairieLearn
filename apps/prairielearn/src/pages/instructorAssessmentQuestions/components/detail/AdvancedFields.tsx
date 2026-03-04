import clsx from 'clsx';
import type {
  FieldError,
  FieldErrors,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';

import { coerceToNumber } from '../../utils/formHelpers.js';

import { InheritableCheckboxField } from './InheritableCheckboxField.js';
import { InheritableField } from './InheritableField.js';

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

/**
 * Describes the parent values from which advanced fields can be inherited,
 * along with form helpers needed to implement the inherit/override/reset pattern.
 * Parent values come from the nearest ancestor that sets them
 * (e.g., assessment for a zone, zone for an alt group, alt group for a question).
 */
export interface AdvancedFieldsInheritance {
  parentAdvanceScorePerc: number | undefined;
  parentGradeRateMinutes: number | undefined;
  parentAllowRealTimeGrading: boolean | undefined;
  parentForceMaxPoints: boolean | undefined;
  inheritedFromLabel: string;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  getValues: UseFormGetValues<any>;
  onSave: (data: any) => void;
}

export function AdvancedFields({
  register,
  errors,
  idPrefix,
  variant,
  inheritance,
}: {
  register: UseFormRegister<any>;
  errors?: FieldErrors;
  idPrefix: string;
  variant: 'question' | 'altGroup' | 'zone';
  inheritance?: AdvancedFieldsInheritance;
}) {
  const advanceScorePercRegisterProps = register('advanceScorePerc', {
    setValueAs: coerceToNumber,
    validate: (v) => {
      if (v == null) return;
      if (v < 0 || v > 100) return 'Advance score % must be between 0 and 100.';
    },
  });

  const gradeRateMinutesRegisterProps = register('gradeRateMinutes', {
    setValueAs: coerceToNumber,
    validate: (v) => {
      if (v == null) return;
      if (v < 0) return 'Grade rate must be non-negative.';
    },
  });

  const renderAdvanceScorePerc = () => {
    if (inheritance?.parentAdvanceScorePerc != null) {
      const watchedValue = inheritance.watch('advanceScorePerc');
      const isInherited = watchedValue === undefined;
      return (
        <InheritableField
          id={`${idPrefix}-advanceScorePerc`}
          label="Advance score %"
          inputType="number"
          isInherited={isInherited}
          inheritedDisplayValue={String(inheritance.parentAdvanceScorePerc)}
          registerProps={advanceScorePercRegisterProps}
          error={errors?.advanceScorePerc as FieldError | undefined}
          helpText={HELP_TEXT.advanceScorePerc[variant]}
          inheritedValueLabel={String(inheritance.parentAdvanceScorePerc)}
          inheritedFromLabel={inheritance.inheritedFromLabel}
          showResetButton={!isInherited}
          onOverride={() =>
            inheritance.setValue('advanceScorePerc', inheritance.parentAdvanceScorePerc, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          onReset={() =>
            inheritance.onSave({ ...inheritance.getValues(), advanceScorePerc: undefined })
          }
        />
      );
    }

    return (
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
          {...advanceScorePercRegisterProps}
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
    );
  };

  const renderGradeRateMinutes = () => {
    if (inheritance?.parentGradeRateMinutes != null) {
      const watchedValue = inheritance.watch('gradeRateMinutes');
      const isInherited = watchedValue === undefined;
      return (
        <InheritableField
          id={`${idPrefix}-gradeRateMinutes`}
          label="Grade rate (minutes)"
          inputType="number"
          step="any"
          isInherited={isInherited}
          inheritedDisplayValue={String(inheritance.parentGradeRateMinutes)}
          registerProps={gradeRateMinutesRegisterProps}
          error={errors?.gradeRateMinutes as FieldError | undefined}
          helpText={HELP_TEXT.gradeRateMinutes[variant]}
          inheritedValueLabel={String(inheritance.parentGradeRateMinutes)}
          inheritedFromLabel={inheritance.inheritedFromLabel}
          showResetButton={!isInherited}
          onOverride={() =>
            inheritance.setValue('gradeRateMinutes', inheritance.parentGradeRateMinutes, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          onReset={() =>
            inheritance.onSave({ ...inheritance.getValues(), gradeRateMinutes: undefined })
          }
        />
      );
    }

    return (
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
          {...gradeRateMinutesRegisterProps}
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
    );
  };

  const renderForceMaxPoints = () => {
    if (inheritance?.parentForceMaxPoints != null) {
      const watchedValue = inheritance.watch('forceMaxPoints');
      const isInherited = watchedValue === undefined;
      return (
        <InheritableCheckboxField
          id={`${idPrefix}-forceMaxPoints`}
          label="Force max points"
          helpText="Award maximum points when the assessment is regraded. Used to fix broken questions."
          isInherited={isInherited}
          inheritedValue={inheritance.parentForceMaxPoints}
          inheritedFromLabel={inheritance.inheritedFromLabel}
          registerProps={register('forceMaxPoints')}
          showResetButton={!isInherited}
          onOverride={() =>
            inheritance.setValue('forceMaxPoints', inheritance.parentForceMaxPoints, {
              shouldDirty: true,
            })
          }
          onReset={() =>
            inheritance.onSave({ ...inheritance.getValues(), forceMaxPoints: undefined })
          }
        />
      );
    }

    return (
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
    );
  };

  const renderAllowRealTimeGrading = () => {
    if (inheritance?.parentAllowRealTimeGrading != null) {
      const watchedValue = inheritance.watch('allowRealTimeGrading');
      const isInherited = watchedValue === undefined;
      return (
        <InheritableCheckboxField
          id={`${idPrefix}-allowRealTimeGrading`}
          label="Allow real-time grading"
          helpText={HELP_TEXT.allowRealTimeGrading[variant]}
          isInherited={isInherited}
          inheritedValue={inheritance.parentAllowRealTimeGrading}
          inheritedFromLabel={inheritance.inheritedFromLabel}
          registerProps={register('allowRealTimeGrading')}
          showResetButton={!isInherited}
          onOverride={() =>
            inheritance.setValue('allowRealTimeGrading', inheritance.parentAllowRealTimeGrading, {
              shouldDirty: true,
            })
          }
          onReset={() =>
            inheritance.onSave({ ...inheritance.getValues(), allowRealTimeGrading: undefined })
          }
        />
      );
    }

    return (
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
        <small
          id={`${idPrefix}-allowRealTimeGrading-help`}
          className="form-text text-muted d-block"
        >
          {HELP_TEXT.allowRealTimeGrading[variant]}
        </small>
      </div>
    );
  };

  return (
    <>
      <h6 className="text-muted text-uppercase small mb-3 mt-4">Advanced</h6>

      {renderAdvanceScorePerc()}
      {renderGradeRateMinutes()}
      {variant !== 'zone' && renderForceMaxPoints()}
      {renderAllowRealTimeGrading()}
    </>
  );
}
