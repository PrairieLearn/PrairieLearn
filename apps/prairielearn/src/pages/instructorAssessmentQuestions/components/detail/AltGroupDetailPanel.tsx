import clsx from 'clsx';
import { useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { DetailState, ZoneAssessmentForm, ZoneQuestionBlockForm } from '../../types.js';
import {
  coerceToNumber,
  coerceToOptionalString,
  extractStringComment,
  formatPoints,
  makeResetAndSave,
  parsePointsListValue,
  validateNonIncreasingPoints,
  validatePointsListFormat,
} from '../../utils/formHelpers.js';
import { getSharedTags, validatePositiveInteger } from '../../utils/questions.js';
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
  questionMetadata,
  idPrefix,
  state,
  onUpdate,
  onDelete,
}: {
  zoneQuestionBlock: ZoneQuestionBlockForm;
  zone: ZoneAssessmentForm;
  questionMetadata: Partial<Record<string, StaffAssessmentQuestionRow>>;
  idPrefix: string;
  state: DetailState;
  onUpdate: (
    questionTrackingId: string,
    question: Partial<ZoneQuestionBlockForm> | Partial<AltGroupFormData>,
  ) => void;
  onDelete: (questionTrackingId: string) => void;
}) {
  const { editMode, assessmentType, assessmentDefaults } = state;
  const alternativeCount = zoneQuestionBlock.alternatives?.length ?? 0;

  const sharedTags = getSharedTags(zoneQuestionBlock.alternatives ?? [], questionMetadata);

  const pointsProperty = assessmentType === 'Exam' ? 'points' : 'autoPoints';
  const maxPointsProperty = assessmentType === 'Exam' ? 'maxPoints' : 'maxAutoPoints';

  const {
    register,
    getValues,
    watch,
    setValue,
    trigger,
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
      forceMaxPoints: editMode
        ? (zoneQuestionBlock.forceMaxPoints ?? false)
        : zoneQuestionBlock.forceMaxPoints,
      allowRealTimeGrading: zoneQuestionBlock.allowRealTimeGrading ?? undefined,
    },
  });

  useEffect(() => {
    // Alternatives can be deleted from the tree while this panel is open.
    // Revalidate immediately so numberChoose errors update without extra input.
    void trigger('numberChoose');
  }, [alternativeCount, trigger]);

  const handleSave = useCallback(
    (data: AltGroupFormData) =>
      onUpdate(zoneQuestionBlock.trackingId, {
        ...data,
        forceMaxPoints: data.forceMaxPoints || undefined,
        allowRealTimeGrading: data.allowRealTimeGrading,
      }),
    [onUpdate, zoneQuestionBlock.trackingId],
  );

  const resetAndSave = useMemo(
    () => makeResetAndSave(handleSave, getValues),
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
    // forceMaxPoints never has a parent for alt groups; it's only defined at the alt group level
    parentForceMaxPoints: undefined,
    advanceScorePercFromLabel: zone.advanceScorePerc != null ? 'zone' : 'assessment',
    gradeRateMinutesFromLabel: zone.gradeRateMinutes != null ? 'zone' : 'assessment',
    allowRealTimeGradingFromLabel: zone.allowRealTimeGrading != null ? 'zone' : 'assessment',
    forceMaxPointsFromLabel: 'assessment',
    watch,
    setValue,
    resetAndSave,
  };

  const watchedAutoPoints = watch(pointsProperty);
  const autoPointsPlaceholder =
    watchedAutoPoints == null
      ? ''
      : String(Array.isArray(watchedAutoPoints) ? watchedAutoPoints[0] : watchedAutoPoints);

  const Wrapper = editMode ? 'div' : 'dl';

  return (
    <div className="p-3">
      <div className={clsx('text-muted small', editMode ? 'mb-3' : 'mb-2')}>
        {alternativeCount} alternative{alternativeCount !== 1 ? 's' : ''} in group
      </div>
      {sharedTags.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {sharedTags.map((tag) => (
            <span key={tag.name} className={`badge color-${tag.color}`}>
              {tag.name}
            </span>
          ))}
        </div>
      )}

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
              viewValue={formatPoints(zoneQuestionBlock[pointsProperty])}
              error={errors[pointsProperty]}
              helpText="Default auto points inherited by alternatives unless overridden."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="number"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  step="any"
                  {...register(pointsProperty, {
                    setValueAs: coerceToNumber,
                    validate: (v, formValues) => {
                      if (typeof v === 'number' && v < 0) {
                        return 'Auto points must be non-negative.';
                      }
                      const maxPoints = formValues[maxPointsProperty];
                      if (typeof v === 'number' && v === 0 && maxPoints != null && maxPoints > 0) {
                        return 'Auto points cannot be 0 when max auto points is greater than 0.';
                      }
                      if (typeof v === 'number' && typeof maxPoints === 'number' && v > maxPoints) {
                        return 'Auto points cannot exceed max auto points.';
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
                zoneQuestionBlock[maxPointsProperty] != null
                  ? String(zoneQuestionBlock[maxPointsProperty])
                  : undefined
              }
              error={errors[maxPointsProperty]}
              helpText="Default max auto points inherited by alternatives unless overridden. Defaults to auto points if not set."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="number"
                  step="any"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  placeholder={autoPointsPlaceholder}
                  {...register(maxPointsProperty, {
                    setValueAs: coerceToNumber,
                    validate: (v, formValues) => {
                      if (v != null && v < 0) return 'Max auto points must be non-negative.';
                      const points = formValues[pointsProperty];
                      if (typeof points === 'number' && points === 0 && v != null && v > 0) {
                        return 'Max auto points must be 0 or empty when auto points is 0.';
                      }
                      if (typeof points === 'number' && typeof v === 'number' && v < points) {
                        return 'Max auto points must be at least auto points.';
                      }
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
                  step="any"
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
              viewValue={formatPoints(zoneQuestionBlock[pointsProperty])}
              error={errors[pointsProperty]}
              helpText="Default points list inherited by alternatives unless overridden."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="text"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  {...register(pointsProperty, {
                    setValueAs: parsePointsListValue,
                    validate: {
                      format: (v) => validatePointsListFormat(v),
                      nonIncreasing: (v) => validateNonIncreasingPoints(v),
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
                  step="any"
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
