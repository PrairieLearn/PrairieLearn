import clsx from 'clsx';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import type { DetailState, ZoneAssessmentForm, ZoneQuestionBlockForm } from '../../types.js';
import {
  coerceToNumber,
  coerceToOptionalString,
  extractStringComment,
  parsePointsListValue,
  resolveMaxPointsProperty,
  resolvePointsProperty,
  validateNonIncreasingPoints,
} from '../../utils/formHelpers.js';
import { validatePositiveInteger } from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';

import { AdvancedFields, type AdvancedFieldsInheritance } from './AdvancedFields.js';
import { FormField } from './FormField.js';

interface AltGroupFormData {
  numberChoose?: number;
  comment?: string;
  points?: number | number[];
  autoPoints?: number | number[];
  maxPoints?: number;
  maxAutoPoints?: number;
  manualPoints?: number;
  triesPerVariant?: number;
  advanceScorePerc?: number;
  gradeRateMinutes?: number;
  forceMaxPoints?: boolean;
  allowRealTimeGrading?: boolean;
}

export function AltGroupDetailPanel({
  zoneQuestionBlock,
  zone,
  idPrefix,
  state,
  onUpdate,
  onDelete,
  onAddAlternative,
}: {
  zoneQuestionBlock: ZoneQuestionBlockForm;
  zone: ZoneAssessmentForm;
  idPrefix: string;
  state: DetailState;
  onUpdate: (
    questionTrackingId: string,
    question: Partial<ZoneQuestionBlockForm> | Partial<AltGroupFormData>,
  ) => void;
  onDelete: (questionTrackingId: string) => void;
  onAddAlternative: (altGroupTrackingId: string) => void;
}) {
  const { editMode, assessmentType, assessmentDefaults } = state;
  const alternativeCount = zoneQuestionBlock.alternatives?.length ?? 0;

  const originalPointsProperty = resolvePointsProperty(assessmentType, zoneQuestionBlock);
  const originalMaxProperty = resolveMaxPointsProperty(originalPointsProperty, zoneQuestionBlock);

  // forceMaxPoints never has a parent for alt groups (parentForceMaxPoints is always undefined)
  const hasAllowRealTimeGradingParent =
    (zone.allowRealTimeGrading ?? assessmentDefaults.allowRealTimeGrading) != null;

  const {
    register,
    getValues,
    watch,
    setValue,
    formState: { errors, isDirty, isValid },
  } = useForm<AltGroupFormData>({
    mode: 'onChange',
    values: {
      numberChoose: zoneQuestionBlock.numberChoose ?? undefined,
      comment: extractStringComment(zoneQuestionBlock.comment),
      points: zoneQuestionBlock.points ?? undefined,
      autoPoints: zoneQuestionBlock.autoPoints ?? undefined,
      maxPoints: zoneQuestionBlock.maxPoints ?? undefined,
      maxAutoPoints: zoneQuestionBlock.maxAutoPoints ?? undefined,
      manualPoints: zoneQuestionBlock.manualPoints ?? undefined,
      triesPerVariant: zoneQuestionBlock.triesPerVariant ?? undefined,
      advanceScorePerc: zoneQuestionBlock.advanceScorePerc ?? undefined,
      gradeRateMinutes: zoneQuestionBlock.gradeRateMinutes ?? undefined,
      forceMaxPoints: zoneQuestionBlock.forceMaxPoints ?? false,
      allowRealTimeGrading:
        zoneQuestionBlock.allowRealTimeGrading ??
        (hasAllowRealTimeGradingParent ? undefined : false),
    },
  });

  const handleSave = useCallback(
    (data: AltGroupFormData) =>
      onUpdate(zoneQuestionBlock.trackingId, {
        ...data,
        forceMaxPoints: data.forceMaxPoints || undefined,
        allowRealTimeGrading: hasAllowRealTimeGradingParent
          ? data.allowRealTimeGrading
          : data.allowRealTimeGrading || undefined,
      }),
    [onUpdate, zoneQuestionBlock.trackingId, hasAllowRealTimeGradingParent],
  );

  const resetAndSave = useCallback(
    (field: string) => handleSave({ ...getValues(), [field]: undefined }),
    [handleSave, getValues],
  );

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave, watch });

  const parentAdvanceScorePerc = zone.advanceScorePerc ?? assessmentDefaults.advanceScorePerc;
  const parentGradeRateMinutes = zone.gradeRateMinutes ?? assessmentDefaults.gradeRateMinutes;
  const parentAllowRealTimeGrading =
    zone.allowRealTimeGrading ?? assessmentDefaults.allowRealTimeGrading;
  const advancedInheritance: AdvancedFieldsInheritance = {
    parentAdvanceScorePerc,
    parentGradeRateMinutes,
    parentAllowRealTimeGrading,
    parentForceMaxPoints: undefined,
    advanceScorePercFromLabel: zone.advanceScorePerc != null ? 'zone' : 'assessment',
    gradeRateMinutesFromLabel: zone.gradeRateMinutes != null ? 'zone' : 'assessment',
    allowRealTimeGradingFromLabel: zone.allowRealTimeGrading != null ? 'zone' : 'assessment',
    forceMaxPointsFromLabel: 'assessment',
    watch,
    setValue,
    resetAndSave,
  };

  const watchedAutoPoints = watch(originalPointsProperty);
  const autoPointsPlaceholder =
    watchedAutoPoints == null
      ? ''
      : String(Array.isArray(watchedAutoPoints) ? watchedAutoPoints[0] : watchedAutoPoints);

  const formatPoints = (v: number | number[] | null | undefined) => {
    if (v == null) return undefined;
    return Array.isArray(v) ? v.join(', ') : String(v);
  };

  const Wrapper = editMode ? 'div' : 'dl';

  return (
    <div className="p-3">
      <div className={clsx('text-muted small', editMode ? 'mb-3' : 'mb-2')}>
        {alternativeCount} alternative{alternativeCount !== 1 ? 's' : ''} in group
      </div>

      <Wrapper className={clsx(!editMode && 'mb-0')}>
        <FormField
          editMode={editMode}
          id={`${idPrefix}-numberChoose`}
          label="Number to choose"
          viewValue={zoneQuestionBlock.numberChoose ?? 1}
          error={errors.numberChoose}
          helpText={`How many of the ${alternativeCount} alternatives to randomly choose for each student (default: 1).`}
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
                  if (v != null && v > alternativeCount) {
                    return `Cannot exceed number of alternatives (${alternativeCount}).`;
                  }
                },
              })}
            />
          )}
        </FormField>

        {assessmentType === 'Homework' ? (
          <>
            <FormField
              editMode={editMode}
              id={`${idPrefix}-autoPoints`}
              label="Auto points (default)"
              viewValue={formatPoints(zoneQuestionBlock[originalPointsProperty])}
              error={errors[originalPointsProperty]}
              helpText="Default auto points inherited by alternatives unless overridden."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="number"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  step="any"
                  {...register(originalPointsProperty, {
                    setValueAs: coerceToNumber,
                    validate: (v) => {
                      if (typeof v === 'number' && v < 0) {
                        return 'Auto points must be non-negative.';
                      }
                    },
                  })}
                />
              )}
            </FormField>
            <FormField
              editMode={editMode}
              id={`${idPrefix}-maxAutoPoints`}
              label="Max auto points (default)"
              viewValue={
                zoneQuestionBlock[originalMaxProperty] != null
                  ? String(zoneQuestionBlock[originalMaxProperty])
                  : undefined
              }
              error={errors[originalMaxProperty]}
              helpText="Default max auto points inherited by alternatives unless overridden. Defaults to auto points if not set."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="number"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  placeholder={autoPointsPlaceholder}
                  {...register(originalMaxProperty, {
                    setValueAs: coerceToNumber,
                    validate: (v) => {
                      if (v != null && v < 0) return 'Max auto points must be non-negative.';
                    },
                  })}
                />
              )}
            </FormField>
            <FormField
              editMode={editMode}
              id={`${idPrefix}-manualPoints`}
              label="Manual points (default)"
              viewValue={
                zoneQuestionBlock.manualPoints != null
                  ? String(zoneQuestionBlock.manualPoints)
                  : undefined
              }
              error={errors.manualPoints}
              helpText="Default manual points inherited by alternatives unless overridden."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="number"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  {...register('manualPoints', {
                    setValueAs: coerceToNumber,
                    validate: (v) => {
                      if (v != null && v < 0) return 'Manual points must be non-negative.';
                    },
                  })}
                />
              )}
            </FormField>
          </>
        ) : (
          <>
            <FormField
              editMode={editMode}
              id={`${idPrefix}-points`}
              label="Points list (default)"
              viewValue={formatPoints(zoneQuestionBlock[originalPointsProperty])}
              error={errors.points}
              helpText="Default points list inherited by alternatives unless overridden."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="text"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  {...register('points', {
                    setValueAs: parsePointsListValue,
                    validate: (v) => validateNonIncreasingPoints(v),
                  })}
                />
              )}
            </FormField>
            <FormField
              editMode={editMode}
              id={`${idPrefix}-manualPoints`}
              label="Manual points (default)"
              viewValue={
                zoneQuestionBlock.manualPoints != null
                  ? String(zoneQuestionBlock.manualPoints)
                  : undefined
              }
              error={errors.manualPoints}
              helpText="Default manual points inherited by alternatives unless overridden."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="number"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  {...register('manualPoints', {
                    setValueAs: coerceToNumber,
                    validate: (v) => {
                      if (v != null && v < 0) return 'Manual points must be non-negative.';
                    },
                  })}
                />
              )}
            </FormField>
          </>
        )}

        <FormField
          editMode={editMode}
          id={`${idPrefix}-comment`}
          label="Comment"
          viewValue={
            zoneQuestionBlock.comment != null ? (
              <span className="text-break">{String(zoneQuestionBlock.comment)}</span>
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
        variant="altGroup"
        editMode={editMode}
        inheritance={advancedInheritance}
      />

      {editMode && (
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onAddAlternative(zoneQuestionBlock.trackingId)}
          >
            Add alternative
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => onDelete(zoneQuestionBlock.trackingId)}
          >
            Delete alternative group
          </button>
        </div>
      )}
    </div>
  );
}
