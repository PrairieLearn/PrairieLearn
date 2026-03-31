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
import type { EditorQuestionMetadata } from '../../../../lib/assessment-question.shared.js';
import { getQuestionUrl } from '../../../../lib/client/url.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type {
  DetailState,
  QuestionAlternativeForm,
  QuestionWithId,
  SelectedItem,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../../types.js';
import {
  coerceToNumber,
  coerceToOptionalString,
  commentToString,
  formatPoints,
  formatPointsValue,
  makeResetAndSave,
  parseCommentValue,
  parsePointsListValue,
  validateAtLeastOnePointsField,
  validateNonIncreasingPoints,
  validatePointsListFormat,
} from '../../utils/formHelpers.js';
import {
  questionHasTitle,
  toAssessmentForPicker,
  validatePositiveInteger,
} from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';
import { AssessmentBadges } from '../AssessmentBadges.js';

import { AdvancedFields, type AdvancedFieldsInheritance } from './AdvancedFields.js';
import { DetailSectionHeader } from './DetailSectionHeader.js';
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
  onPickQuestion,
  onResetButtonClick,
  onFormValidChange,
}: {
  question: QuestionWithId;
  zoneQuestionBlock?: ZoneQuestionBlockForm;
  zone?: ZoneAssessmentForm;
  questionData: EditorQuestionMetadata | null;
  idPrefix: string;
  state: DetailState;
  onUpdate: (
    questionTrackingId: string,
    question: Partial<ZoneQuestionBlockForm> | Partial<QuestionAlternativeForm>,
    alternativeTrackingId?: string,
  ) => void;
  onPickQuestion: (currentSelection: SelectedItem) => void;
  onResetButtonClick: (assessmentQuestionId: string) => void;
  onFormValidChange: (isValid: boolean) => void;
}) {
  const {
    editMode,
    hasCourseInstancePermissionEdit,
    assessmentType,
    constantQuestionValue,
    assessmentDefaults,
    courseInstanceId,
    hasCoursePermissionPreview,
  } = state;
  const isAlternative = !!zoneQuestionBlock;
  const isManualGrading = questionData?.question.grading_method === 'Manual';
  const hasTitle = questionHasTitle(questionData);

  const isAutoGradedWithOnlyManualPoints =
    questionData != null &&
    !isManualGrading &&
    (question.manualPoints ?? zoneQuestionBlock?.manualPoints) != null &&
    (question.autoPoints ?? zoneQuestionBlock?.autoPoints) == null;

  // For read-only display, use merged values (own ?? inherited)
  const autoPointsValue = question.autoPoints ?? zoneQuestionBlock?.autoPoints;
  const maxAutoPointsValue = question.maxAutoPoints ?? zoneQuestionBlock?.maxAutoPoints;
  const manualPointsValue = question.manualPoints ?? zoneQuestionBlock?.manualPoints;

  // Alternative's own values (may be undefined = inheriting from pool)
  const ownAutoPoints = question.autoPoints ?? undefined;
  const ownMaxAutoPoints = question.maxAutoPoints ?? undefined;
  const ownManualPoints = question.manualPoints ?? undefined;

  // Pool's values (what would be inherited)
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
    trigger,
    formState: { errors, isDirty, isValid },
  } = useForm<QuestionFormData>({
    mode: 'onChange',
    values: {
      id: question.id,
      comment: commentToString(question.comment),
      autoPoints: isAlternative ? ownAutoPoints : (autoPointsValue ?? undefined),
      maxAutoPoints: isAlternative ? ownMaxAutoPoints : (maxAutoPointsValue ?? undefined),
      manualPoints: isAlternative ? ownManualPoints : (manualPointsValue ?? undefined),
      triesPerVariant: isAlternative ? ownTriesPerVariant : (question.triesPerVariant ?? undefined),
      advanceScorePerc: question.advanceScorePerc ?? undefined,
      gradeRateMinutes: question.gradeRateMinutes ?? undefined,
      forceMaxPoints: question.forceMaxPoints ?? (hasForceMaxPointsParent ? undefined : false),
      allowRealTimeGrading: question.allowRealTimeGrading ?? undefined,
    },
    // Prevent autosave from clobbering in-progress typing. Without this,
    // the autosave feedback loop (edit → save → parent state update →
    // values prop change → form reset) resets the input mid-keystroke.
    // This is safe because the only source of values changes while the
    // panel is open is autosave; switching entities remounts the component.
    resetOptions: { keepDirtyValues: true, keepErrors: true },
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
          comment: parseCommentValue(data.comment),
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

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave, watch, trigger });

  // Validate immediately on mount so that pre-existing invalid state
  // (e.g. no points set on a newly added question) is flagged right away.
  // We use the result of trigger() directly because formState.isValid may
  // not update until user interaction with mode: 'onChange'.
  useEffect(() => {
    void trigger().then((valid) => {
      // TODO: you can easily click off the item and save the form to bypass this validation.
      onFormValidChange(valid);
    });
  }, [trigger, onFormValidChange]);

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    onFormValidChange(isValid);
  }, [isValid, onFormValidChange]);

  const advancedInheritance: AdvancedFieldsInheritance = run(() => {
    if (isAlternative) {
      // Alternatives inherit from alt pool -> zone -> assessment
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
            ? 'pool'
            : zone?.advanceScorePerc != null
              ? 'zone'
              : 'assessment',
        gradeRateMinutesFromLabel:
          zoneQuestionBlock.gradeRateMinutes != null
            ? 'pool'
            : zone?.gradeRateMinutes != null
              ? 'zone'
              : 'assessment',
        allowRealTimeGradingFromLabel:
          zoneQuestionBlock.allowRealTimeGrading != null
            ? 'pool'
            : zone?.allowRealTimeGrading != null
              ? 'zone'
              : 'assessment',
        // Only alt pools define forceMaxPoints; fallback is never displayed
        forceMaxPointsFromLabel: zoneQuestionBlock.forceMaxPoints != null ? 'pool' : 'assessment',
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
      // Only alt pools define forceMaxPoints; fallback is never displayed
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
      {/* Question header (number, title, tags, badges) — same in both modes */}
      <div className="mb-3">
        <div className="fw-semibold mb-1 d-inline-flex align-items-center">
          {questionData
            ? run(() => {
                const titleContent = hasTitle ? (
                  questionData.question.title
                ) : (
                  <span className="font-monospace">{question.id}</span>
                );
                return (
                  <>
                    {hasCoursePermissionPreview ? (
                      <a
                        href={getQuestionUrl({
                          courseInstanceId,
                          questionId: questionData.question.id,
                        })}
                      >
                        {titleContent}
                      </a>
                    ) : (
                      titleContent
                    )}
                    {!hasTitle && (
                      <CopyButton
                        text={question.id}
                        tooltipId="copy-qid"
                        ariaLabel="Copy QID"
                        className="ms-1"
                      />
                    )}
                  </>
                );
              })
            : null}
        </div>
        {questionData && (
          <div className="d-flex flex-column gap-1">
            {hasTitle && (
              <span
                className="d-inline-flex align-items-center text-muted font-monospace"
                style={{ fontSize: '0.75rem' }}
              >
                {question.id}
                <CopyButton
                  text={question.id}
                  tooltipId="copy-qid"
                  ariaLabel="Copy QID"
                  className="ms-1"
                />
              </span>
            )}
            <div>
              <span className={`badge color-${questionData.topic.color}`}>
                {questionData.topic.name}
              </span>
            </div>
            {questionData.tags && questionData.tags.length > 0 && (
              <div className="d-flex flex-wrap gap-1">
                {questionData.tags.map((tag) => (
                  <span key={tag.name} className={`badge color-${tag.color}`}>
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
            {questionData.other_assessments && questionData.other_assessments.length > 0 && (
              <div className="d-flex flex-wrap align-items-center gap-1">
                <AssessmentBadges
                  assessments={toAssessmentForPicker(questionData.other_assessments)}
                  courseInstanceId={courseInstanceId}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <DetailSectionHeader>Settings</DetailSectionHeader>

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
          showManualPointsOnlyForAutoGraded={isAutoGradedWithOnlyManualPoints}
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
              <span className="text-break">{commentToString(question.comment)}</span>
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

      {questionData?.question.preferences_schema &&
        Object.keys(questionData.question.preferences_schema).length > 0 && (
          <>
            <DetailSectionHeader>Preferences</DetailSectionHeader>
            <Wrapper className={clsx(!editMode && 'mb-0')}>
              {Object.entries(questionData.question.preferences_schema).map(([name, schema]) => (
                <PreferenceField
                  key={name}
                  name={name}
                  schema={schema}
                  idPrefix={idPrefix}
                  editMode={editMode}
                  preferences={question.preferences}
                  questionTrackingId={questionTrackingId}
                  alternativeTrackingId={alternativeTrackingId}
                  onUpdate={onUpdate}
                />
              ))}
            </Wrapper>
          </>
        )}

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
        {!editMode &&
          hasCourseInstancePermissionEdit &&
          questionData?.assessment_question_id != null && (
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
                onClick={() => onResetButtonClick(questionData.assessment_question_id!)}
              >
                Reset question variants
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
  showManualPointsOnlyForAutoGraded,
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
  showManualPointsOnlyForAutoGraded: boolean;
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
  const autoPointsHelpText = isHomework ? (
    <>
      Points awarded for the auto-graded component.{' '}
      {constantQuestionValue
        ? 'Each correct answer is worth this many points.'
        : 'Each consecutive correct answer is worth more; an incorrect answer resets the value.'}{' '}
      <a
        href="https://docs.prairielearn.com/assessment/configuration/#question-points-for-homework-assessments"
        target="_blank"
        rel="noreferrer"
      >
        Learn more about question points
      </a>
    </>
  ) : (
    'Points for each attempt, as a comma-separated list (e.g. "10, 5, 2, 1").'
  );
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
    validate: homeworkMaxPointsValidation,
  };
  const maxAutoPointsHelpText = 'Maximum total auto-graded points.';

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
      {showManualPointsOnlyForAutoGraded && (
        <div className="alert alert-info small py-2 mb-2" role="alert">
          <i className="bi bi-info-circle-fill me-1" aria-hidden="true" />
          This question is auto-graded but only has manual points. Auto-grading results will not
          contribute to the score.
        </div>
      )}
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
      {isHomework &&
        (!isManualGrading || showMaxAutoPointsForManual) &&
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
            placeholder={autoPointsPlaceholder}
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
                placeholder={autoPointsPlaceholder}
                {...register('maxAutoPoints', maxAutoPointsRegisterOptions)}
              />
            )}
          </FormField>
        ))}
      {!isManualGrading && manualPointsField}
    </>
  );
}

function PreferenceField({
  name,
  schema,
  idPrefix,
  editMode,
  preferences,
  questionTrackingId,
  alternativeTrackingId,
  onUpdate,
}: {
  name: string;
  schema: { type: string; default: string | number | boolean; enum?: (string | number)[] };
  idPrefix: string;
  editMode: boolean;
  preferences: Record<string, string | number | boolean> | undefined;
  questionTrackingId: string;
  alternativeTrackingId: string | undefined;
  onUpdate: (
    questionTrackingId: string,
    question: Partial<ZoneQuestionBlockForm> | Partial<QuestionAlternativeForm>,
    alternativeTrackingId?: string,
  ) => void;
}) {
  const id = `${idPrefix}-pref-${name}`;
  const defaultDisplay = String(schema.default);
  const currentValue = preferences?.[name];
  const hasOverride = currentValue != null;

  function setOverride(value: string | number | boolean) {
    onUpdate(
      questionTrackingId,
      { preferences: { ...preferences, [name]: value } },
      alternativeTrackingId,
    );
  }

  function clearOverride() {
    const newPreferences = { ...preferences };
    delete newPreferences[name];
    onUpdate(
      questionTrackingId,
      {
        preferences: Object.keys(newPreferences).length > 0 ? newPreferences : undefined,
      },
      alternativeTrackingId,
    );
  }

  if (!editMode) {
    return (
      <FormField
        editMode={false}
        id={id}
        label={<span className="font-monospace">{name}</span>}
        viewValue={hasOverride ? String(currentValue) : `${defaultDisplay} (default)`}
      >
        {() => null}
      </FormField>
    );
  }

  if (!hasOverride) {
    return (
      <div className="mb-3">
        <label htmlFor={id} className="form-label">
          <span className="font-monospace">{name}</span>
        </label>
        <input
          type="text"
          className="form-control form-control-sm bg-light"
          id={id}
          value={defaultDisplay}
          aria-describedby={`${id}-help`}
          disabled
        />
        <small id={`${id}-help`} className="form-text text-muted">
          Using question default.{' '}
          <button
            type="button"
            className="btn btn-link btn-sm p-0 align-baseline"
            onClick={() => setOverride(schema.default)}
          >
            Override
          </button>
        </small>
      </div>
    );
  }

  const resetHelpText = (
    <small id={`${id}-help`} className="form-text text-muted">
      Overrides question default ({defaultDisplay}).{' '}
      <button
        type="button"
        className="btn btn-link btn-sm p-0 align-baseline"
        title="Reset to question default"
        onClick={clearOverride}
      >
        Reset
      </button>
    </small>
  );

  if (schema.type === 'boolean') {
    return (
      <div className="mb-3">
        <label htmlFor={id} className="form-label">
          <span className="font-monospace">{name}</span>
        </label>
        <select
          className="form-select form-select-sm"
          id={id}
          value={String(currentValue)}
          aria-describedby={`${id}-help`}
          onChange={(e) => setOverride(e.target.value === 'true')}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        {resetHelpText}
      </div>
    );
  }

  if (schema.enum && schema.enum.length > 0) {
    return (
      <div className="mb-3">
        <label htmlFor={id} className="form-label">
          <span className="font-monospace">{name}</span>
        </label>
        <select
          className="form-select form-select-sm"
          id={id}
          value={String(currentValue)}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            const val = e.target.value;
            setOverride(schema.type === 'number' ? Number(val) : val);
          }}
        >
          {schema.enum.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
        {resetHelpText}
      </div>
    );
  }

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        <span className="font-monospace">{name}</span>
      </label>
      <input
        type={schema.type === 'number' ? 'number' : 'text'}
        step={schema.type === 'number' ? 'any' : undefined}
        className="form-control form-control-sm"
        id={id}
        aria-describedby={`${id}-help`}
        defaultValue={String(currentValue)}
        onBlur={(e) => {
          const val = e.target.value.trim();
          if (val === '') {
            clearOverride();
          } else {
            setOverride(schema.type === 'number' ? Number(val) : val);
          }
        }}
      />
      {resetHelpText}
    </div>
  );
}
