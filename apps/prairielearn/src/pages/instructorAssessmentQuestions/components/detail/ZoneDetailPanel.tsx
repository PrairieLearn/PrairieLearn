import clsx from 'clsx';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import type { DetailState, ZoneAssessmentForm } from '../../types.js';
import {
  coerceToNumber,
  coerceToOptionalString,
  extractStringComment,
  makeResetAndSave,
} from '../../utils/formHelpers.js';
import { validatePositiveInteger } from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';

import { AdvancedFields, type AdvancedFieldsInheritance } from './AdvancedFields.js';
import { FormCheckField, FormField } from './FormField.js';

interface ZoneFormData {
  title: string;
  maxPoints?: number;
  numberChoose?: number;
  bestQuestions?: number;
  lockpoint: boolean;
  comment?: string;
  advanceScorePerc?: number;
  gradeRateMinutes?: number;
  allowRealTimeGrading?: boolean;
}

export function ZoneDetailPanel({
  zone,
  zoneIndex,
  idPrefix,
  state,
  onUpdate,
  onDelete,
}: {
  zone: ZoneAssessmentForm;
  zoneIndex: number;
  idPrefix: string;
  state: DetailState;
  onUpdate: (zoneTrackingId: string, zone: Partial<ZoneAssessmentForm>) => void;
  onDelete: (zoneTrackingId: string) => void;
}) {
  const { editMode, assessmentDefaults } = state;
  const formValues: ZoneFormData = {
    title: zone.title ?? '',
    maxPoints: zone.maxPoints ?? undefined,
    numberChoose: zone.numberChoose ?? undefined,
    bestQuestions: zone.bestQuestions ?? undefined,
    lockpoint: zone.lockpoint,
    comment: extractStringComment(zone.comment),
    advanceScorePerc: zone.advanceScorePerc ?? undefined,
    gradeRateMinutes: zone.gradeRateMinutes ?? undefined,
    // We do this so that `isDirty = false` when the value is inherited.
    allowRealTimeGrading: zone.allowRealTimeGrading ?? undefined,
  };

  const {
    register,
    getValues,
    watch,
    setValue,
    formState: { errors, isDirty, isValid },
  } = useForm<ZoneFormData>({
    mode: 'onChange',
    values: formValues,
  });

  const handleSave = useCallback(
    (data: ZoneFormData) => {
      onUpdate(zone.trackingId, {
        title: data.title || undefined,
        maxPoints: data.maxPoints,
        numberChoose: data.numberChoose,
        bestQuestions: data.bestQuestions,
        lockpoint: data.lockpoint,
        comment: data.comment || undefined,
        advanceScorePerc: data.advanceScorePerc,
        gradeRateMinutes: data.gradeRateMinutes,
        allowRealTimeGrading: data.allowRealTimeGrading,
      });
    },
    [onUpdate, zone.trackingId],
  );

  const resetAndSave = useMemo(
    () => makeResetAndSave(handleSave, getValues),
    [handleSave, getValues],
  );

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave, watch });

  const advancedInheritance: AdvancedFieldsInheritance = {
    parentAdvanceScorePerc: assessmentDefaults.advanceScorePerc,
    parentGradeRateMinutes: assessmentDefaults.gradeRateMinutes,
    parentAllowRealTimeGrading: assessmentDefaults.allowRealTimeGrading,
    parentForceMaxPoints: undefined,
    advanceScorePercFromLabel: 'assessment',
    gradeRateMinutesFromLabel: 'assessment',
    allowRealTimeGradingFromLabel: 'assessment',
    forceMaxPointsFromLabel: 'assessment',
    watch,
    setValue,
    resetAndSave,
  };

  const Wrapper = editMode ? 'div' : 'dl';

  return (
    <div className="p-3">
      <Wrapper className={clsx(!editMode && 'mb-0')}>
        <FormField
          editMode={editMode}
          id={`${idPrefix}-title`}
          label="Title"
          viewValue={zone.title || <span className="text-muted">No title</span>}
          helpText="Display name shown to students."
        >
          {(aria) => (
            <input
              type="text"
              className="form-control form-control-sm"
              {...aria.inputProps}
              {...register('title')}
            />
          )}
        </FormField>

        <FormField
          editMode={editMode}
          id={`${idPrefix}-maxPoints`}
          label="Max points"
          viewValue={zone.maxPoints}
          error={errors.maxPoints}
          helpText="Maximum total points from this zone that count toward the assessment."
          hideWhenEmpty
        >
          {(aria) => (
            <input
              type="number"
              step="any"
              className={clsx('form-control form-control-sm', aria.errorClass)}
              {...aria.inputProps}
              {...register('maxPoints', {
                setValueAs: coerceToNumber,
                validate: (v) => {
                  if (v != null && v < 0) return 'Max points must be non-negative.';
                },
              })}
            />
          )}
        </FormField>

        <FormField
          editMode={editMode}
          id={`${idPrefix}-numberChoose`}
          label="Number to choose"
          viewValue={zone.numberChoose}
          error={errors.numberChoose}
          helpText="How many questions from this zone to present (leave empty for all)."
          hideWhenEmpty
        >
          {(aria) => (
            <input
              type="number"
              className={clsx('form-control form-control-sm', aria.errorClass)}
              {...aria.inputProps}
              {...register('numberChoose', {
                setValueAs: coerceToNumber,
                validate: (v) => {
                  const msg = validatePositiveInteger(v, 'Number to choose');
                  if (msg) return msg;
                  if (v != null && v > zone.questions.length) {
                    return `Cannot exceed number of questions in zone (${zone.questions.length}).`;
                  }
                },
              })}
            />
          )}
        </FormField>

        <FormField
          editMode={editMode}
          id={`${idPrefix}-bestQuestions`}
          label="Best questions"
          viewValue={zone.bestQuestions}
          error={errors.bestQuestions}
          helpText="Only the N highest-scoring questions in this zone count toward the total (leave empty for all)."
          hideWhenEmpty
        >
          {(aria) => (
            <input
              type="number"
              className={clsx('form-control form-control-sm', aria.errorClass)}
              {...aria.inputProps}
              {...register('bestQuestions', {
                setValueAs: coerceToNumber,
                validate: (v) => {
                  const msg = validatePositiveInteger(v, 'Best questions');
                  if (msg) return msg;
                  if (v != null && v > zone.questions.length) {
                    return `Cannot exceed number of questions in zone (${zone.questions.length}).`;
                  }
                  const numberChoose = getValues('numberChoose');
                  if (v != null && numberChoose != null && v > numberChoose) {
                    return `Cannot exceed number to choose (${numberChoose}).`;
                  }
                },
              })}
            />
          )}
        </FormField>

        <FormCheckField
          editMode={editMode}
          id={`${idPrefix}-lockpoint`}
          label="Lockpoint"
          viewValue={zone.lockpoint}
          error={errors.lockpoint}
          helpText="Creates a one-way barrier; crossing it makes all earlier zones read-only."
          hideWhenEmpty
        >
          {(aria) => (
            <input
              type="checkbox"
              className={clsx('form-check-input', aria.errorClass)}
              {...aria.inputProps}
              {...register('lockpoint', {
                validate: (v) => {
                  if (v && zoneIndex === 0) {
                    return 'The first zone cannot be a lockpoint.';
                  }
                },
              })}
            />
          )}
        </FormCheckField>

        <FormField
          editMode={editMode}
          id={`${idPrefix}-comment`}
          label="Comment"
          viewValue={
            zone.comment != null ? (
              <span className="text-break">{String(zone.comment)}</span>
            ) : undefined
          }
          helpText="Internal note, not shown to students."
          hideWhenEmpty
        >
          {(aria) => (
            <textarea
              className="form-control form-control-sm"
              {...aria.inputProps}
              rows={2}
              {...register('comment', { setValueAs: coerceToOptionalString })}
            />
          )}
        </FormField>
      </Wrapper>

      <AdvancedFields
        register={register}
        errors={errors}
        idPrefix={idPrefix}
        variant="zone"
        editMode={editMode}
        inheritance={advancedInheritance}
      />

      <div className="mt-2 mb-3 text-muted small">
        {zone.questions.length} question{zone.questions.length !== 1 ? 's' : ''} in zone
      </div>

      {editMode && (
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={() => onDelete(zone.trackingId)}
        >
          Delete zone
        </button>
      )}
    </div>
  );
}
