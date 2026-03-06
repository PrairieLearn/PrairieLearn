import clsx from 'clsx';
import type {
  FieldError,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';

import type { InheritanceSource } from '../../types.js';
import { coerceToBoolean, coerceToNumber } from '../../utils/formHelpers.js';

import { FormCheckField, FormField } from './FormField.js';
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
 * Each `*FromLabel` identifies which ancestor level a field's inherited value
 * comes from (displayed as "Inherited from {label}"). The label is only shown
 * when the corresponding `parent*` value is non-null; when `parent*` is
 * undefined the label is never displayed, so its value is irrelevant.
 *
 * For `forceMaxPoints` specifically, only alt groups define this property —
 * zones and assessments do not — so `parentForceMaxPoints` is `undefined`
 * everywhere except inside an alt group. The `forceMaxPointsFromLabel` fallback
 * is therefore never displayed outside of alt groups.
 */
export interface AdvancedFieldsInheritance {
  parentAdvanceScorePerc: number | undefined;
  parentGradeRateMinutes: number | undefined;
  parentAllowRealTimeGrading: boolean | undefined;
  parentForceMaxPoints: boolean | undefined;
  advanceScorePercFromLabel: InheritanceSource;
  gradeRateMinutesFromLabel: InheritanceSource;
  allowRealTimeGradingFromLabel: InheritanceSource;
  forceMaxPointsFromLabel: InheritanceSource;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  resetAndSave: (field: string) => void;
}

export function AdvancedFields({
  register,
  errors,
  idPrefix,
  variant,
  editMode = true,
  inheritance,
}: {
  register: UseFormRegister<any>;
  errors?: FieldErrors;
  idPrefix: string;
  variant: 'question' | 'altGroup' | 'zone';
  editMode?: boolean;
  inheritance: AdvancedFieldsInheritance;
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

  const watchedAdvanceScorePerc = inheritance.watch('advanceScorePerc');
  const watchedGradeRateMinutes = inheritance.watch('gradeRateMinutes');
  const watchedForceMaxPoints = inheritance.watch('forceMaxPoints');
  const watchedAllowRealTimeGrading = inheritance.watch('allowRealTimeGrading');

  // In view mode, hide entire section if all effective values are null
  if (!editMode) {
    const effectiveAdvanceScorePerc = watchedAdvanceScorePerc ?? inheritance.parentAdvanceScorePerc;
    const effectiveGradeRateMinutes = watchedGradeRateMinutes ?? inheritance.parentGradeRateMinutes;
    const effectiveForceMaxPoints = watchedForceMaxPoints ?? inheritance.parentForceMaxPoints;
    const effectiveAllowRealTimeGrading =
      watchedAllowRealTimeGrading ?? inheritance.parentAllowRealTimeGrading;

    if (
      effectiveAdvanceScorePerc == null &&
      effectiveGradeRateMinutes == null &&
      effectiveForceMaxPoints == null &&
      effectiveAllowRealTimeGrading == null
    ) {
      return null;
    }
  }

  const renderAdvanceScorePerc = () => {
    if (inheritance.parentAdvanceScorePerc != null) {
      const isInherited = watchedAdvanceScorePerc === undefined;
      return (
        <InheritableField
          id={`${idPrefix}-advanceScorePerc`}
          label="Advance score %"
          inputType="number"
          step="any"
          editMode={editMode}
          isInherited={isInherited}
          inheritedDisplayValue={String(inheritance.parentAdvanceScorePerc)}
          viewValue={
            !isInherited && watchedAdvanceScorePerc != null
              ? `${watchedAdvanceScorePerc}%`
              : undefined
          }
          registerProps={advanceScorePercRegisterProps}
          error={errors?.advanceScorePerc as FieldError | undefined}
          helpText={HELP_TEXT.advanceScorePerc[variant]}
          inheritedValueLabel={String(inheritance.parentAdvanceScorePerc)}
          inheritedFromLabel={inheritance.advanceScorePercFromLabel}
          showResetButton={!isInherited}
          onOverride={() =>
            inheritance.setValue('advanceScorePerc', inheritance.parentAdvanceScorePerc, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          onReset={() => inheritance.resetAndSave('advanceScorePerc')}
        />
      );
    }

    const viewValue = watchedAdvanceScorePerc != null ? `${watchedAdvanceScorePerc}%` : undefined;

    return (
      <FormField
        editMode={editMode}
        id={`${idPrefix}-advanceScorePerc`}
        label="Advance score %"
        viewValue={viewValue}
        error={errors?.advanceScorePerc as FieldError | undefined}
        helpText={HELP_TEXT.advanceScorePerc[variant]}
        hideWhenEmpty
      >
        {(aria) => (
          <input
            type="number"
            step="any"
            className={clsx('form-control form-control-sm', aria.errorClass)}
            {...aria.inputProps}
            {...advanceScorePercRegisterProps}
          />
        )}
      </FormField>
    );
  };

  const renderGradeRateMinutes = () => {
    if (inheritance.parentGradeRateMinutes != null) {
      const isInherited = watchedGradeRateMinutes === undefined;
      return (
        <InheritableField
          id={`${idPrefix}-gradeRateMinutes`}
          label="Grade rate (minutes)"
          inputType="number"
          step="any"
          editMode={editMode}
          isInherited={isInherited}
          inheritedDisplayValue={String(inheritance.parentGradeRateMinutes)}
          viewValue={
            !isInherited && watchedGradeRateMinutes != null
              ? String(watchedGradeRateMinutes)
              : undefined
          }
          registerProps={gradeRateMinutesRegisterProps}
          error={errors?.gradeRateMinutes as FieldError | undefined}
          helpText={HELP_TEXT.gradeRateMinutes[variant]}
          inheritedValueLabel={String(inheritance.parentGradeRateMinutes)}
          inheritedFromLabel={inheritance.gradeRateMinutesFromLabel}
          showResetButton={!isInherited}
          onOverride={() =>
            inheritance.setValue('gradeRateMinutes', inheritance.parentGradeRateMinutes, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          onReset={() => inheritance.resetAndSave('gradeRateMinutes')}
        />
      );
    }

    const viewValue = watchedGradeRateMinutes != null ? String(watchedGradeRateMinutes) : undefined;

    return (
      <FormField
        editMode={editMode}
        id={`${idPrefix}-gradeRateMinutes`}
        label="Grade rate (minutes)"
        viewValue={viewValue}
        error={errors?.gradeRateMinutes as FieldError | undefined}
        helpText={HELP_TEXT.gradeRateMinutes[variant]}
        hideWhenEmpty
      >
        {(aria) => (
          <input
            type="number"
            className={clsx('form-control form-control-sm', aria.errorClass)}
            step="any"
            {...aria.inputProps}
            {...gradeRateMinutesRegisterProps}
          />
        )}
      </FormField>
    );
  };

  const renderForceMaxPoints = () => {
    if (inheritance.parentForceMaxPoints != null) {
      const isInherited = watchedForceMaxPoints === undefined;
      return (
        <InheritableCheckboxField
          id={`${idPrefix}-forceMaxPoints`}
          label="Force max points"
          helpText="Award maximum points when the assessment is regraded. Used to fix broken questions."
          editMode={editMode}
          isInherited={isInherited}
          inheritedValue={inheritance.parentForceMaxPoints}
          inheritedFromLabel={inheritance.forceMaxPointsFromLabel}
          viewValue={!isInherited ? !!watchedForceMaxPoints : undefined}
          registerProps={register('forceMaxPoints', { setValueAs: coerceToBoolean })}
          showResetButton={!isInherited}
          onOverride={() =>
            inheritance.setValue('forceMaxPoints', inheritance.parentForceMaxPoints, {
              shouldDirty: true,
            })
          }
          onReset={() => inheritance.resetAndSave('forceMaxPoints')}
        />
      );
    }

    return (
      <FormCheckField
        editMode={editMode}
        id={`${idPrefix}-forceMaxPoints`}
        label="Force max points"
        viewValue={!!watchedForceMaxPoints}
        helpText="Award maximum points when the assessment is regraded. Used to fix broken questions."
        hideWhenEmpty
      >
        {(aria) => (
          <input
            type="checkbox"
            className={clsx('form-check-input', aria.errorClass)}
            {...aria.inputProps}
            {...register('forceMaxPoints', { setValueAs: coerceToBoolean })}
          />
        )}
      </FormCheckField>
    );
  };

  const renderAllowRealTimeGrading = () => {
    if (inheritance.parentAllowRealTimeGrading != null) {
      const isInherited = watchedAllowRealTimeGrading === undefined;
      return (
        <InheritableCheckboxField
          id={`${idPrefix}-allowRealTimeGrading`}
          label="Allow real-time grading"
          helpText={HELP_TEXT.allowRealTimeGrading[variant]}
          editMode={editMode}
          isInherited={isInherited}
          inheritedValue={inheritance.parentAllowRealTimeGrading}
          inheritedFromLabel={inheritance.allowRealTimeGradingFromLabel}
          viewValue={!isInherited ? !!watchedAllowRealTimeGrading : undefined}
          registerProps={register('allowRealTimeGrading', { setValueAs: coerceToBoolean })}
          showResetButton={!isInherited}
          onOverride={() =>
            inheritance.setValue('allowRealTimeGrading', inheritance.parentAllowRealTimeGrading, {
              shouldDirty: true,
            })
          }
          onReset={() => inheritance.resetAndSave('allowRealTimeGrading')}
        />
      );
    }

    return (
      <FormCheckField
        editMode={editMode}
        id={`${idPrefix}-allowRealTimeGrading`}
        label="Allow real-time grading"
        viewValue={!!watchedAllowRealTimeGrading}
        helpText={HELP_TEXT.allowRealTimeGrading[variant]}
        hideWhenEmpty
      >
        {(aria) => (
          <input
            type="checkbox"
            className={clsx('form-check-input', aria.errorClass)}
            {...aria.inputProps}
            {...register('allowRealTimeGrading', { setValueAs: coerceToBoolean })}
          />
        )}
      </FormCheckField>
    );
  };

  const fields = (
    <>
      {renderAdvanceScorePerc()}
      {renderGradeRateMinutes()}
      {variant !== 'zone' && renderForceMaxPoints()}
      {renderAllowRealTimeGrading()}
    </>
  );

  return (
    <>
      <h6 className="text-muted text-uppercase small mb-3 mt-4">Advanced</h6>
      {editMode ? fields : <dl className="mb-0">{fields}</dl>}
    </>
  );
}
