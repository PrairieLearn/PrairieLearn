import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type FieldErrors,
  type RegisterOptions,
  type UseFormRegister,
  type UseFormSetValue,
  useForm,
} from 'react-hook-form';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { CopyButton } from '../../../../components/CopyButton.js';
import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import { getQuestionUrl } from '../../../../lib/client/url.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type {
  DetailState,
  QuestionAlternativeForm,
  SelectedItem,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../../types.js';
import {
  coerceToNumber,
  coerceToOptionalString,
  extractStringComment,
  formatPoints,
  formatPointsValue,
  makeResetAndSave,
  parsePointsListValue,
  validateAtLeastOnePointsField,
  validateNonIncreasingPoints,
  validatePointsListFormat,
} from '../../utils/formHelpers.js';
import { validatePositiveInteger } from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';

import { AdvancedFields, type AdvancedFieldsInheritance } from './AdvancedFields.js';
import { FormField } from './FormField.js';
import { InheritableField } from './InheritableField.js';

interface QuestionFormData {
  id?: string;
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

export function QuestionDetailPanel({
  question,
  zoneQuestionBlock,
  zone,
  questionData,
  idPrefix,
  state,
  onUpdate,
  onDelete,
  onPickQuestion,
  onResetButtonClick,
  onFormValidChange,
}: {
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock?: ZoneQuestionBlockForm;
  zone?: ZoneAssessmentForm;
  questionData: StaffAssessmentQuestionRow | null;
  idPrefix: string;
  state: DetailState;
  onUpdate: (
    questionTrackingId: string,
    question: Partial<ZoneQuestionBlockForm> | Partial<QuestionAlternativeForm>,
    alternativeTrackingId?: string,
  ) => void;
  onDelete: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
  onPickQuestion: (currentSelection: SelectedItem) => void;
  onResetButtonClick: (assessmentQuestionId: string) => void;
  onFormValidChange: (isValid: boolean) => void;
}) {
  const {
    editMode,
    assessmentType,
    constantQuestionValue,
    assessmentDefaults,
    courseInstanceId,
    hasCoursePermissionPreview,
  } = state;
  const isAlternative = !!zoneQuestionBlock;
  const isManualGrading = questionData?.question.grading_method === 'Manual';

  // For read-only display, use merged values (own ?? inherited)
  const autoPointsValue = question.autoPoints ?? zoneQuestionBlock?.autoPoints;
  const maxAutoPointsValue = question.maxAutoPoints ?? zoneQuestionBlock?.maxAutoPoints;
  const manualPointsValue = question.manualPoints ?? zoneQuestionBlock?.manualPoints;

  // Alternative's own values (may be undefined = inheriting from group)
  const ownAutoPoints = question.autoPoints ?? undefined;
  const ownMaxAutoPoints = question.maxAutoPoints ?? undefined;
  const ownManualPoints = question.manualPoints ?? undefined;

  // Group's values (what would be inherited)
  const inheritedAutoPoints = zoneQuestionBlock?.autoPoints ?? undefined;
  const inheritedMaxAutoPoints = zoneQuestionBlock?.maxAutoPoints ?? undefined;
  const inheritedManualPoints = zoneQuestionBlock?.manualPoints ?? undefined;
  const inheritedTriesPerVariant = zoneQuestionBlock?.triesPerVariant ?? undefined;

  const ownTriesPerVariant = question.triesPerVariant ?? undefined;

  // Track which inheritable fields are in "override" mode. Initialized from
  // props; toggled only by Override/Reset buttons. This prevents the field
  // from switching back to inherited mode when the user clears it via
  // backspace (which would set the form value to undefined and immediately
  // re-show the disabled inherited input before the user can type a new value).
  const [overriddenFields, setOverriddenFields] = useState(() => ({
    autoPoints: question.autoPoints != null,
    maxAutoPoints: question.maxAutoPoints != null,
    manualPoints: question.manualPoints != null,
    triesPerVariant: question.triesPerVariant != null,
  }));

  // Compute parent boolean availability before useForm so we can set
  // stable defaults that survive the DOM round-trip without false dirty flags.
  const hasForceMaxPointsParent = isAlternative && zoneQuestionBlock.forceMaxPoints != null;
  const {
    register,
    getValues,
    watch,
    setValue,
    formState: { errors, isDirty, isValid },
  } = useForm<QuestionFormData>({
    mode: 'onChange',
    values: {
      id: question.id ?? '',
      comment: extractStringComment(question.comment) || undefined,
      autoPoints: isAlternative ? ownAutoPoints : (autoPointsValue ?? undefined),
      maxAutoPoints: isAlternative ? ownMaxAutoPoints : (maxAutoPointsValue ?? undefined),
      manualPoints: isAlternative ? ownManualPoints : (manualPointsValue ?? undefined),
      triesPerVariant: isAlternative ? ownTriesPerVariant : (question.triesPerVariant ?? undefined),
      advanceScorePerc: question.advanceScorePerc ?? undefined,
      gradeRateMinutes: question.gradeRateMinutes ?? undefined,
      forceMaxPoints: question.forceMaxPoints ?? (hasForceMaxPointsParent ? undefined : false),
      allowRealTimeGrading: question.allowRealTimeGrading ?? undefined,
    },
  });

  const watchedAutoPoints = watch('autoPoints');
  const autoPointsPlaceholder = run(() => {
    const pts = watchedAutoPoints ?? (isAlternative ? inheritedAutoPoints : undefined);
    if (pts == null) return '';
    return String(Array.isArray(pts) ? pts[0] : pts);
  });

  const isAutoPointsInherited =
    isAlternative && !overriddenFields.autoPoints && inheritedAutoPoints != null;
  const isMaxAutoPointsInherited =
    isAlternative && !overriddenFields.maxAutoPoints && inheritedMaxAutoPoints != null;
  const isManualPointsInherited =
    isAlternative && !overriddenFields.manualPoints && inheritedManualPoints != null;

  const isTriesPerVariantInherited =
    isAlternative && !overriddenFields.triesPerVariant && inheritedTriesPerVariant != null;

  const questionTrackingId = isAlternative ? zoneQuestionBlock.trackingId : question.trackingId;
  const alternativeTrackingId = isAlternative ? question.trackingId : undefined;

  const handleSave = useCallback(
    (data: QuestionFormData) =>
      onUpdate(
        questionTrackingId,
        {
          ...data,
          forceMaxPoints: hasForceMaxPointsParent
            ? data.forceMaxPoints
            : data.forceMaxPoints || undefined,
          allowRealTimeGrading: data.allowRealTimeGrading,
        },
        alternativeTrackingId,
      ),
    [onUpdate, questionTrackingId, alternativeTrackingId, hasForceMaxPointsParent],
  );

  const resetAndSave = useMemo(
    () => makeResetAndSave(handleSave, getValues),
    [handleSave, getValues],
  );

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave, watch });

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    onFormValidChange(isValid);
  }, [isValid, onFormValidChange]);

  const advancedInheritance: AdvancedFieldsInheritance = run(() => {
    if (isAlternative) {
      // Alternatives inherit from alt group -> zone -> assessment
      const parentAdvanceScorePerc =
        zoneQuestionBlock.advanceScorePerc ??
        zone?.advanceScorePerc ??
        assessmentDefaults.advanceScorePerc;
      const parentGradeRateMinutes =
        zoneQuestionBlock.gradeRateMinutes ??
        zone?.gradeRateMinutes ??
        assessmentDefaults.gradeRateMinutes;
      const parentAllowRealTimeGrading =
        zoneQuestionBlock.allowRealTimeGrading ??
        zone?.allowRealTimeGrading ??
        assessmentDefaults.allowRealTimeGrading;
      const parentForceMaxPoints = zoneQuestionBlock.forceMaxPoints;
      return {
        parentAdvanceScorePerc,
        parentGradeRateMinutes,
        parentAllowRealTimeGrading,
        parentForceMaxPoints,
        advanceScorePercFromLabel:
          zoneQuestionBlock.advanceScorePerc != null
            ? 'group'
            : zone?.advanceScorePerc != null
              ? 'zone'
              : 'assessment',
        gradeRateMinutesFromLabel:
          zoneQuestionBlock.gradeRateMinutes != null
            ? 'group'
            : zone?.gradeRateMinutes != null
              ? 'zone'
              : 'assessment',
        allowRealTimeGradingFromLabel:
          zoneQuestionBlock.allowRealTimeGrading != null
            ? 'group'
            : zone?.allowRealTimeGrading != null
              ? 'zone'
              : 'assessment',
        // Only alt groups define forceMaxPoints; fallback is never displayed
        forceMaxPointsFromLabel: zoneQuestionBlock.forceMaxPoints != null ? 'group' : 'assessment',
        watch,
        setValue,
        resetAndSave,
      };
    }
    // Standalone questions inherit from zone -> assessment
    const parentAdvanceScorePerc = zone?.advanceScorePerc ?? assessmentDefaults.advanceScorePerc;
    const parentGradeRateMinutes = zone?.gradeRateMinutes ?? assessmentDefaults.gradeRateMinutes;
    const parentAllowRealTimeGrading =
      zone?.allowRealTimeGrading ?? assessmentDefaults.allowRealTimeGrading;
    return {
      parentAdvanceScorePerc,
      parentGradeRateMinutes,
      parentAllowRealTimeGrading,
      parentForceMaxPoints: undefined,
      advanceScorePercFromLabel: zone?.advanceScorePerc != null ? 'zone' : 'assessment',
      gradeRateMinutesFromLabel: zone?.gradeRateMinutes != null ? 'zone' : 'assessment',
      allowRealTimeGradingFromLabel: zone?.allowRealTimeGrading != null ? 'zone' : 'assessment',
      // Only alt groups define forceMaxPoints; fallback is never displayed
      forceMaxPointsFromLabel: 'assessment',
      watch,
      setValue,
      resetAndSave,
    };
  });

  const savedAutoPointsSet =
    question.autoPoints != null || (isAlternative && zoneQuestionBlock.autoPoints != null);
  const savedMaxAutoPointsSet =
    question.maxAutoPoints != null || (isAlternative && zoneQuestionBlock.maxAutoPoints != null);
  const showAutoPointsForManual = isManualGrading && savedAutoPointsSet;
  const showMaxAutoPointsForManual = isManualGrading && savedMaxAutoPointsSet;

  const Wrapper = editMode ? 'div' : 'dl';

  return (
    <div className="p-3">
      {/* Question header (title, tags, badges) — same in both modes */}
      {questionData && (
        <div className="mb-3">
          <div className="fw-semibold mb-1">
            {hasCoursePermissionPreview ? (
              <a href={getQuestionUrl({ courseInstanceId, questionId: questionData.question.id })}>
                {questionData.question.title}
              </a>
            ) : (
              questionData.question.title
            )}
          </div>
          <span
            className="d-inline-flex align-items-center text-muted font-monospace"
            style={{ fontSize: '0.75rem' }}
          >
            {question.id}
            {question.id && (
              <CopyButton
                text={question.id}
                tooltipId="copy-qid"
                ariaLabel="Copy QID"
                className="ms-1"
              />
            )}
          </span>
          <div className="mt-1">
            <span className={`badge color-${questionData.topic.color}`}>
              {questionData.topic.name}
            </span>
          </div>
          {questionData.tags && questionData.tags.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mt-1">
              {questionData.tags.map((tag) => (
                <span key={tag.name} className={`badge color-${tag.color}`}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QID field — edit mode only */}
      {editMode && (
        <div className="mb-3">
          <label htmlFor={`${idPrefix}-id`} className="form-label">
            QID
          </label>
          <div className="input-group input-group-sm">
            <input
              type="text"
              className={clsx('form-control', errors.id && 'is-invalid')}
              id={`${idPrefix}-id`}
              readOnly
              {...register('id')}
            />
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                onPickQuestion(
                  isAlternative
                    ? {
                        type: 'alternative',
                        questionTrackingId,
                        alternativeTrackingId: alternativeTrackingId!,
                      }
                    : { type: 'question', questionTrackingId },
                );
              }}
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Points fields */}
      <Wrapper className={clsx(!editMode && 'mb-0')}>
        <PointsFields
          assessmentType={assessmentType}
          editMode={editMode}
          idPrefix={idPrefix}
          isAlternative={isAlternative}
          isManualGrading={isManualGrading}
          constantQuestionValue={constantQuestionValue}
          autoPointsValue={autoPointsValue}
          maxAutoPointsValue={maxAutoPointsValue}
          manualPointsValue={manualPointsValue}
          isAutoPointsInherited={isAutoPointsInherited}
          isMaxAutoPointsInherited={isMaxAutoPointsInherited}
          isManualPointsInherited={isManualPointsInherited}
          inheritedAutoPoints={inheritedAutoPoints}
          inheritedMaxAutoPoints={inheritedMaxAutoPoints}
          inheritedManualPoints={inheritedManualPoints}
          autoPointsPlaceholder={autoPointsPlaceholder}
          register={register}
          errors={errors}
          setValue={setValue}
          resetAndSave={resetAndSave}
          showAutoPointsForManual={showAutoPointsForManual}
          showMaxAutoPointsForManual={showMaxAutoPointsForManual}
          onFieldOverrideChange={(field, overridden) =>
            setOverriddenFields((prev) => ({ ...prev, [field]: overridden }))
          }
        />

        {/* Tries per variant (Homework only) */}
        {assessmentType === 'Homework' &&
          (isAlternative ? (
            <InheritableField
              id={`${idPrefix}-triesPerVariant`}
              label="Tries per variant"
              inputType="number"
              editMode={editMode}
              isInherited={isTriesPerVariantInherited}
              inheritedDisplayValue={String(inheritedTriesPerVariant ?? '')}
              viewValue={
                !isTriesPerVariantInherited && question.triesPerVariant != null
                  ? String(question.triesPerVariant)
                  : undefined
              }
              registerProps={register('triesPerVariant', {
                setValueAs: coerceToNumber,
                validate: (v) => validatePositiveInteger(v, 'Tries per variant'),
              })}
              error={errors.triesPerVariant}
              helpText="Number of submission attempts allowed per question variant."
              inheritedValueLabel={
                inheritedTriesPerVariant != null ? String(inheritedTriesPerVariant) : undefined
              }
              showResetButton={inheritedTriesPerVariant != null && !isTriesPerVariantInherited}
              onOverride={() => {
                setOverriddenFields((prev) => ({ ...prev, triesPerVariant: true }));
                setValue('triesPerVariant', inheritedTriesPerVariant, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              onReset={() => {
                setOverriddenFields((prev) => ({ ...prev, triesPerVariant: false }));
                resetAndSave('triesPerVariant');
              }}
            />
          ) : (
            <FormField
              editMode={editMode}
              id={`${idPrefix}-triesPerVariant`}
              label="Tries per variant"
              viewValue={question.triesPerVariant}
              error={errors.triesPerVariant}
              helpText="Number of submission attempts allowed per question variant."
              hideWhenEmpty
            >
              {(aria) => (
                <input
                  type="number"
                  className={clsx('form-control form-control-sm', aria.errorClass)}
                  {...aria.inputProps}
                  {...register('triesPerVariant', {
                    setValueAs: coerceToNumber,
                    validate: (v) => validatePositiveInteger(v, 'Tries per variant'),
                  })}
                />
              )}
            </FormField>
          ))}

        {/* Comment */}
        <FormField
          editMode={editMode}
          id={`${idPrefix}-comment`}
          label="Comment"
          viewValue={
            question.comment != null ? (
              <span className="text-break">{String(question.comment)}</span>
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

      {/* Advanced fields */}
      <AdvancedFields
        register={register}
        errors={errors}
        idPrefix={idPrefix}
        variant="question"
        editMode={editMode}
        inheritance={advancedInheritance}
      />

      {/* Action buttons */}
      <div className="d-flex gap-2">
        {questionData && questionData.assessment_question.id !== '0' && (
          <OverlayTrigger
            placement="top"
            tooltip={{
              props: { id: 'reset-variants-tooltip' },
              body: 'Resets all existing variants for this question on this assessment, so students will get new variants on their next visit.',
            }}
          >
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => onResetButtonClick(questionData.assessment_question.id)}
            >
              Reset question variants
            </button>
          </OverlayTrigger>
        )}
        {editMode && (
          <OverlayTrigger
            placement="top"
            tooltip={{
              props: { id: 'delete-question-tooltip' },
              body: 'Remove this question from the assessment',
            }}
          >
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => onDelete(questionTrackingId, question.id ?? '', alternativeTrackingId)}
            >
              Delete
            </button>
          </OverlayTrigger>
        )}
      </div>
    </div>
  );
}

function PointsFields({
  assessmentType,
  editMode,
  idPrefix,
  isAlternative,
  isManualGrading,
  constantQuestionValue,
  autoPointsValue,
  maxAutoPointsValue,
  manualPointsValue,
  isAutoPointsInherited,
  isMaxAutoPointsInherited,
  isManualPointsInherited,
  inheritedAutoPoints,
  inheritedMaxAutoPoints,
  inheritedManualPoints,
  autoPointsPlaceholder,
  register,
  errors,
  setValue,
  resetAndSave,
  showAutoPointsForManual,
  showMaxAutoPointsForManual,
  onFieldOverrideChange,
}: {
  assessmentType: EnumAssessmentType;
  editMode: boolean;
  idPrefix: string;
  isAlternative: boolean;
  isManualGrading: boolean;
  constantQuestionValue: boolean;
  autoPointsValue: number | number[] | null | undefined;
  maxAutoPointsValue: number | number[] | null | undefined;
  manualPointsValue: number | null | undefined;
  isAutoPointsInherited: boolean;
  isMaxAutoPointsInherited: boolean;
  isManualPointsInherited: boolean;
  inheritedAutoPoints: number | number[] | undefined;
  inheritedMaxAutoPoints: number | undefined;
  inheritedManualPoints: number | undefined;
  autoPointsPlaceholder: string;
  register: UseFormRegister<QuestionFormData>;
  errors: FieldErrors<QuestionFormData>;
  setValue: UseFormSetValue<QuestionFormData>;
  resetAndSave: (field: string) => void;
  showAutoPointsForManual: boolean;
  showMaxAutoPointsForManual: boolean;
  onFieldOverrideChange: (field: string, overridden: boolean) => void;
}) {
  const isHomework = assessmentType === 'Homework';

  const parentValues = isAlternative
    ? {
        autoPoints: isAutoPointsInherited ? inheritedAutoPoints : undefined,
        maxAutoPoints: isMaxAutoPointsInherited ? inheritedMaxAutoPoints : undefined,
        manualPoints: isManualPointsInherited ? inheritedManualPoints : undefined,
      }
    : undefined;

  const pointsValidation = (_value: unknown, formValues: QuestionFormData) =>
    validateAtLeastOnePointsField(formValues, parentValues);

  const nonNegativePointsValidation = (v: number | number[] | undefined) => {
    if (typeof v === 'number' && v < 0) return 'Points must be non-negative.';
  };

  const resolveEffectivePoints = (formValues: QuestionFormData) => {
    const points = formValues.autoPoints ?? parentValues?.autoPoints;
    const maxPoints = formValues.maxAutoPoints ?? parentValues?.maxAutoPoints;
    return { points, maxPoints };
  };

  const homeworkAutoPointsValidation = (_value: unknown, formValues: QuestionFormData) => {
    const { points, maxPoints } = resolveEffectivePoints(formValues);
    if (typeof points === 'number' && points === 0 && maxPoints != null && maxPoints > 0) {
      return 'Auto points cannot be 0 when max auto points is greater than 0.';
    }
    if (typeof points === 'number' && typeof maxPoints === 'number' && points > maxPoints) {
      return 'Auto points cannot exceed max auto points.';
    }
    return pointsValidation(_value, formValues);
  };

  const homeworkMaxPointsValidation = (_value: unknown, formValues: QuestionFormData) => {
    const { points, maxPoints } = resolveEffectivePoints(formValues);
    if (typeof points === 'number' && points === 0 && maxPoints != null && maxPoints > 0) {
      return 'Max auto points must be 0 or empty when auto points is 0.';
    }
    if (typeof points === 'number' && typeof maxPoints === 'number' && maxPoints < points) {
      return 'Max auto points must be at least auto points.';
    }
    if (maxPoints != null && maxPoints < 0) return 'Max auto points must be non-negative.';
  };

  const viewAutoPoints = formatPoints(autoPointsValue);
  const viewMaxAutoPoints = run(() => {
    if (isManualGrading && (isHomework || !showMaxAutoPointsForManual)) return undefined;
    const isDefault = maxAutoPointsValue == null;
    const effectiveMax = maxAutoPointsValue ?? autoPointsValue;
    if (effectiveMax == null) return undefined;
    const val = Array.isArray(effectiveMax) ? effectiveMax[0] : effectiveMax;
    return isDefault ? `${val} (default)` : String(val);
  });

  const autoPointsId = `${idPrefix}-${isHomework ? 'autoPoints' : 'pointsList'}`;
  const autoPointsInputType = isHomework ? 'number' : 'text';
  const autoPointsHelpText = isHomework
    ? 'Points awarded for the auto-graded component.'
    : 'Points for each attempt, as a comma-separated list (e.g. "10, 5, 2, 1").';
  const autoPointsRegisterOptions: RegisterOptions<QuestionFormData, 'autoPoints'> = isHomework
    ? {
        setValueAs: coerceToNumber,
        deps: ['maxAutoPoints', 'manualPoints'],
        validate: {
          atLeastOne: pointsValidation,
          crossField: homeworkAutoPointsValidation,
          nonNegative: (v: number | number[] | undefined) => nonNegativePointsValidation(v),
        },
      }
    : {
        pattern: {
          value: /^[0-9., ]*$/,
          message: 'Points must be a number or a comma-separated list of numbers.',
        },
        setValueAs: parsePointsListValue,
        deps: ['manualPoints'],
        validate: {
          atLeastOne: pointsValidation,
          format: (v: number | number[] | string | undefined) => validatePointsListFormat(v),
          nonIncreasing: (v: number | number[] | string | undefined) =>
            validateNonIncreasingPoints(v),
        },
      };

  const maxAutoPointsRegisterOptions: RegisterOptions<QuestionFormData, 'maxAutoPoints'> = {
    setValueAs: coerceToNumber,
    deps: ['autoPoints'],
    ...(isHomework ? { validate: homeworkMaxPointsValidation } : {}),
  };
  const maxAutoPointsHelpText = run(() => {
    if (!isHomework) return 'Max auto points for this question.';
    return constantQuestionValue ? (
      <>
        Maximum total auto-graded points. Students must answer correctly{' '}
        <code>maxAutoPoints / autoPoints</code> times to earn full credit.{' '}
        <a
          href="https://docs.prairielearn.com/assessment/configuration/#question-points-for-homework-assessments"
          target="_blank"
          rel="noreferrer"
        >
          Learn more about question points
        </a>
      </>
    ) : (
      <>
        Maximum total auto-graded points. Each consecutive correct answer is worth more; an
        incorrect answer resets the value.{' '}
        <a
          href="https://docs.prairielearn.com/assessment/configuration/#question-points-for-homework-assessments"
          target="_blank"
          rel="noreferrer"
        >
          Learn more about question points
        </a>
      </>
    );
  });
  const maxAutoPointsPlaceholder = isHomework ? autoPointsPlaceholder : undefined;

  const manualPointsRegisterOptions: RegisterOptions<QuestionFormData, 'manualPoints'> = {
    setValueAs: coerceToNumber,
    deps: ['autoPoints'],
    validate: {
      atLeastOne: pointsValidation,
      nonNegative: nonNegativePointsValidation,
    },
  };

  const manualPointsField = isAlternative ? (
    <InheritableField
      id={`${idPrefix}-manualPoints`}
      label="Manual points"
      inputType="number"
      step="any"
      editMode={editMode}
      isInherited={isManualPointsInherited}
      inheritedDisplayValue={String(inheritedManualPoints ?? '')}
      viewValue={
        !isManualPointsInherited && manualPointsValue != null
          ? String(manualPointsValue)
          : undefined
      }
      registerProps={register('manualPoints', manualPointsRegisterOptions)}
      error={errors.manualPoints}
      helpText="Points awarded for the manually graded component."
      inheritedValueLabel={
        inheritedManualPoints != null ? String(inheritedManualPoints) : undefined
      }
      showResetButton={inheritedManualPoints != null && !isManualPointsInherited}
      onOverride={() => {
        onFieldOverrideChange('manualPoints', true);
        setValue('manualPoints', inheritedManualPoints, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }}
      onReset={() => {
        onFieldOverrideChange('manualPoints', false);
        resetAndSave('manualPoints');
      }}
    />
  ) : (
    <FormField
      editMode={editMode}
      id={`${idPrefix}-manualPoints`}
      label="Manual points"
      viewValue={manualPointsValue != null ? String(manualPointsValue) : undefined}
      error={errors.manualPoints}
      helpText="Points awarded for the manually graded component."
      hideWhenEmpty
    >
      {(aria) => (
        <input
          type="number"
          step="any"
          className={clsx('form-control form-control-sm', aria.errorClass)}
          {...aria.inputProps}
          {...register('manualPoints', manualPointsRegisterOptions)}
        />
      )}
    </FormField>
  );

  return (
    <>
      {isManualGrading && manualPointsField}
      {(showAutoPointsForManual || showMaxAutoPointsForManual) && (
        <div className="alert alert-warning small py-2 mb-2" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
          Auto points have no effect on manually-graded questions.
        </div>
      )}
      {(!isManualGrading || showAutoPointsForManual) &&
        (isAlternative ? (
          <InheritableField
            id={autoPointsId}
            label="Auto points"
            inputType={autoPointsInputType}
            step={isHomework ? 'any' : undefined}
            editMode={editMode}
            isInherited={isAutoPointsInherited}
            inheritedDisplayValue={formatPointsValue(inheritedAutoPoints)}
            viewValue={!isAutoPointsInherited ? viewAutoPoints : undefined}
            registerProps={register('autoPoints', autoPointsRegisterOptions)}
            error={errors.autoPoints}
            helpText={autoPointsHelpText}
            inheritedValueLabel={formatPointsValue(inheritedAutoPoints)}
            showResetButton={inheritedAutoPoints != null && !isAutoPointsInherited}
            onOverride={() => {
              onFieldOverrideChange('autoPoints', true);
              setValue('autoPoints', inheritedAutoPoints, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            onReset={() => {
              onFieldOverrideChange('autoPoints', false);
              resetAndSave('autoPoints');
            }}
          />
        ) : (
          <FormField
            editMode={editMode}
            id={autoPointsId}
            label="Auto points"
            viewValue={viewAutoPoints}
            error={errors.autoPoints}
            helpText={autoPointsHelpText}
            hideWhenEmpty
          >
            {(aria) => (
              <input
                type={autoPointsInputType}
                className={clsx('form-control form-control-sm', aria.errorClass)}
                {...aria.inputProps}
                step={isHomework ? 'any' : undefined}
                {...register('autoPoints', autoPointsRegisterOptions)}
              />
            )}
          </FormField>
        ))}
      {(!isManualGrading || showMaxAutoPointsForManual) &&
        (isAlternative ? (
          <InheritableField
            id={`${idPrefix}-maxAutoPoints`}
            label="Max auto points"
            inputType="number"
            step="any"
            editMode={editMode}
            isInherited={isMaxAutoPointsInherited}
            inheritedDisplayValue={String(inheritedMaxAutoPoints ?? '')}
            viewValue={!isMaxAutoPointsInherited ? viewMaxAutoPoints : undefined}
            registerProps={register('maxAutoPoints', maxAutoPointsRegisterOptions)}
            error={errors.maxAutoPoints}
            helpText={maxAutoPointsHelpText}
            placeholder={maxAutoPointsPlaceholder}
            inheritedValueLabel={
              inheritedMaxAutoPoints != null ? String(inheritedMaxAutoPoints) : undefined
            }
            showResetButton={inheritedMaxAutoPoints != null && !isMaxAutoPointsInherited}
            onOverride={() => {
              onFieldOverrideChange('maxAutoPoints', true);
              setValue('maxAutoPoints', inheritedMaxAutoPoints, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            onReset={() => {
              onFieldOverrideChange('maxAutoPoints', false);
              resetAndSave('maxAutoPoints');
            }}
          />
        ) : (
          <FormField
            editMode={editMode}
            id={`${idPrefix}-maxAutoPoints`}
            label="Max auto points"
            viewValue={viewMaxAutoPoints}
            error={errors.maxAutoPoints}
            helpText={maxAutoPointsHelpText}
            hideWhenEmpty
          >
            {(aria) => (
              <input
                type="number"
                step="any"
                className={clsx('form-control form-control-sm', aria.errorClass)}
                {...aria.inputProps}
                placeholder={maxAutoPointsPlaceholder}
                {...register('maxAutoPoints', maxAutoPointsRegisterOptions)}
              />
            )}
          </FormField>
        ))}
      {!isManualGrading && manualPointsField}
    </>
  );
}
