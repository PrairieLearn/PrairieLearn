import clsx from 'clsx';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { CopyButton } from '../../../../components/CopyButton.js';
import { HistMini } from '../../../../components/HistMini.js';
import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import { getQuestionUrl } from '../../../../lib/client/url.js';
import type {
  DetailState,
  QuestionAlternativeForm,
  SelectedItem,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../../types.js';
import {
  coerceToNumber,
  extractStringComment,
  formatPointsValue,
  parsePointsListValue,
  resolveMaxPointsProperty,
  resolvePointsProperty,
  validateAtLeastOnePointsField,
  validateNonIncreasingPoints,
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
}) {
  const {
    editMode,
    assessmentType,
    assessmentDefaults,
    courseInstanceId,
    hasCoursePermissionPreview,
  } = state;
  const isAlternative = !!zoneQuestionBlock;
  const isManualGrading = questionData?.question.grading_method === 'Manual';

  const originalPointsProperty = resolvePointsProperty(question, zoneQuestionBlock);
  const originalMaxProperty = resolveMaxPointsProperty(
    originalPointsProperty,
    question,
    zoneQuestionBlock,
  );

  // For read-only display, use merged values (own ?? inherited)
  const autoPointsValue =
    question[originalPointsProperty] ?? zoneQuestionBlock?.[originalPointsProperty];
  const maxAutoPointsValue =
    question[originalMaxProperty] ?? zoneQuestionBlock?.[originalMaxProperty];
  const manualPointsValue = question.manualPoints ?? zoneQuestionBlock?.manualPoints;

  // Alternative's own values (may be undefined = inheriting from group)
  const ownPointsValue = question[originalPointsProperty] ?? undefined;
  const ownMaxValue = question[originalMaxProperty] ?? undefined;
  const ownManualPoints = question.manualPoints ?? undefined;

  // Group's values (what would be inherited)
  const inheritedPointsValue = zoneQuestionBlock?.[originalPointsProperty] ?? undefined;
  const inheritedMaxValue = zoneQuestionBlock?.[originalMaxProperty] ?? undefined;
  const inheritedManualPoints = zoneQuestionBlock?.manualPoints ?? undefined;

  const parentValues = isAlternative
    ? {
        [originalPointsProperty]: inheritedPointsValue,
        [originalMaxProperty]: inheritedMaxValue,
        manualPoints: inheritedManualPoints,
      }
    : undefined;

  const {
    register,
    getValues,
    watch,
    setValue,
    formState: { errors, isDirty, isValid },
  } = useForm<QuestionFormData>({
    mode: 'onChange',
    values: {
      id: question.id ?? undefined,
      comment: extractStringComment(question.comment),
      [originalPointsProperty]: isAlternative ? ownPointsValue : (autoPointsValue ?? undefined),
      [originalMaxProperty]: isAlternative ? ownMaxValue : (maxAutoPointsValue ?? undefined),
      manualPoints: isAlternative ? ownManualPoints : (manualPointsValue ?? undefined),
      triesPerVariant: question.triesPerVariant ?? undefined,
      advanceScorePerc: question.advanceScorePerc ?? undefined,
      gradeRateMinutes: question.gradeRateMinutes ?? undefined,
      forceMaxPoints: question.forceMaxPoints ?? undefined,
      allowRealTimeGrading: question.allowRealTimeGrading ?? undefined,
    },
  });

  const watchedPoints = watch(originalPointsProperty);
  const watchedMax = watch(originalMaxProperty);
  const watchedManualPoints = watch('manualPoints');

  const autoPointsPlaceholder = run(() => {
    const pts = watchedPoints ?? (isAlternative ? inheritedPointsValue : undefined);
    if (pts == null) return '';
    return String(Array.isArray(pts) ? pts[0] : pts);
  });

  const isPointsInherited =
    isAlternative && watchedPoints === undefined && inheritedPointsValue != null;
  const isMaxInherited = isAlternative && watchedMax === undefined && inheritedMaxValue != null;
  const isManualPointsInherited =
    isAlternative && watchedManualPoints === undefined && inheritedManualPoints != null;

  const questionTrackingId = isAlternative ? zoneQuestionBlock.trackingId : question.trackingId;
  const alternativeTrackingId = isAlternative ? question.trackingId : undefined;

  const handleSave = useCallback(
    (data: QuestionFormData) => onUpdate(questionTrackingId, data, alternativeTrackingId),
    [onUpdate, questionTrackingId, alternativeTrackingId],
  );

  const resetAndSave = useCallback(
    (field: string) => handleSave({ ...getValues(), [field]: undefined }),
    [handleSave, getValues],
  );

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave });

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
      forceMaxPointsFromLabel: 'assessment',
      watch,
      setValue,
      resetAndSave,
    };
  });

  const pointsValidation = (_value: unknown, formValues: QuestionFormData) =>
    validateAtLeastOnePointsField(formValues, parentValues);

  const nonNegativePointsValidation = (v: number | undefined) => {
    if (v != null && v < 0) return 'Points must be non-negative.';
  };

  const homeworkAutoPointsValidation = (_value: unknown, formValues: QuestionFormData) => {
    const points = formValues[originalPointsProperty];
    const maxPoints = formValues[originalMaxProperty];
    if (typeof points === 'number' && points === 0 && maxPoints != null && maxPoints > 0) {
      return 'Auto points cannot be 0 when max auto points is greater than 0.';
    }
    if (typeof points === 'number' && typeof maxPoints === 'number' && points > maxPoints) {
      return 'Auto points cannot exceed max auto points.';
    }
    return pointsValidation(_value, formValues);
  };

  const homeworkMaxPointsValidation = (_value: unknown, formValues: QuestionFormData) => {
    const points = formValues[originalPointsProperty];
    const maxPoints = formValues[originalMaxProperty];
    if (typeof points === 'number' && points === 0 && maxPoints != null && maxPoints > 0) {
      return 'Max auto points must be 0 or empty when auto points is 0.';
    }
    if (typeof points === 'number' && typeof maxPoints === 'number' && maxPoints < points) {
      return 'Max auto points must be at least auto points.';
    }
    if (maxPoints != null && maxPoints < 0) return 'Max auto points must be non-negative.';
  };

  const formatPoints = (v: number | number[] | null | undefined) => {
    if (v == null) return undefined;
    return Array.isArray(v) ? v.join(', ') : String(v);
  };

  const pointsLabel = isManualGrading
    ? 'Points (manual)'
    : assessmentType === 'Exam'
      ? 'Points'
      : 'Auto points';

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
              <span className="ms-1">
                <CopyButton text={question.id} tooltipId="copy-qid" ariaLabel="Copy QID" />
              </span>
            )}
          </span>
          <div className="text-muted small mt-1">
            <span className={`badge color-${questionData.topic.color}`}>
              {questionData.topic.name}
            </span>
          </div>
          {questionData.tags && questionData.tags.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mt-2">
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
      {assessmentType === 'Homework' ? (
        <HomeworkPointsFields
          editMode={editMode}
          idPrefix={idPrefix}
          isAlternative={isAlternative}
          isManualGrading={isManualGrading}
          pointsLabel={pointsLabel}
          autoPointsValue={autoPointsValue}
          maxAutoPointsValue={maxAutoPointsValue}
          manualPointsValue={manualPointsValue}
          isPointsInherited={isPointsInherited}
          isMaxInherited={isMaxInherited}
          isManualPointsInherited={isManualPointsInherited}
          inheritedPointsValue={inheritedPointsValue}
          inheritedMaxValue={inheritedMaxValue}
          inheritedManualPoints={inheritedManualPoints}
          autoPointsPlaceholder={autoPointsPlaceholder}
          originalPointsProperty={originalPointsProperty}
          originalMaxProperty={originalMaxProperty}
          register={register}
          errors={errors}
          setValue={setValue}
          resetAndSave={resetAndSave}
          pointsValidation={pointsValidation}
          nonNegativePointsValidation={nonNegativePointsValidation}
          homeworkAutoPointsValidation={homeworkAutoPointsValidation}
          homeworkMaxPointsValidation={homeworkMaxPointsValidation}
          formatPoints={formatPoints}
        />
      ) : (
        <ExamPointsFields
          editMode={editMode}
          idPrefix={idPrefix}
          isAlternative={isAlternative}
          isManualGrading={isManualGrading}
          pointsLabel={pointsLabel}
          autoPointsValue={autoPointsValue}
          manualPointsValue={manualPointsValue}
          isPointsInherited={isPointsInherited}
          isManualPointsInherited={isManualPointsInherited}
          inheritedPointsValue={inheritedPointsValue}
          inheritedManualPoints={inheritedManualPoints}
          originalPointsProperty={originalPointsProperty}
          register={register}
          errors={errors}
          setValue={setValue}
          resetAndSave={resetAndSave}
          pointsValidation={pointsValidation}
          nonNegativePointsValidation={nonNegativePointsValidation}
          formatPoints={formatPoints}
        />
      )}

      {/* Tries per variant (Homework only) */}
      {assessmentType === 'Homework' && (
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
      )}

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
            {...register('comment')}
          />
        )}
      </FormField>

      {/* Advanced fields */}
      <AdvancedFields
        register={register}
        errors={errors}
        idPrefix={idPrefix}
        variant="question"
        editMode={editMode}
        inheritance={advancedInheritance}
      />

      {/* Stats — shown in both modes */}
      {questionData?.assessment_question.mean_question_score != null && (
        <dl className="mb-0">
          <dt>Mean score</dt>
          <dd>{questionData.assessment_question.mean_question_score.toFixed(1)}%</dd>
        </dl>
      )}
      {questionData?.assessment_question.number_submissions_hist && (
        <div className="mb-3">
          <div className="text-muted small mb-1">Submissions</div>
          <HistMini
            data={questionData.assessment_question.number_submissions_hist}
            options={{ width: 100, height: 40 }}
          />
        </div>
      )}

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

function HomeworkPointsFields({
  editMode,
  idPrefix,
  isAlternative,
  isManualGrading,
  pointsLabel,
  autoPointsValue,
  maxAutoPointsValue,
  manualPointsValue,
  isPointsInherited,
  isMaxInherited,
  isManualPointsInherited,
  inheritedPointsValue,
  inheritedMaxValue,
  inheritedManualPoints,
  autoPointsPlaceholder,
  originalPointsProperty,
  originalMaxProperty,
  register,
  errors,
  setValue,
  resetAndSave,
  pointsValidation,
  nonNegativePointsValidation,
  homeworkAutoPointsValidation,
  homeworkMaxPointsValidation,
  formatPoints,
}: {
  editMode: boolean;
  idPrefix: string;
  isAlternative: boolean;
  isManualGrading: boolean;
  pointsLabel: string;
  autoPointsValue: number | number[] | null | undefined;
  maxAutoPointsValue: number | number[] | null | undefined;
  manualPointsValue: number | null | undefined;
  isPointsInherited: boolean;
  isMaxInherited: boolean;
  isManualPointsInherited: boolean;
  inheritedPointsValue: number | number[] | undefined;
  inheritedMaxValue: number | undefined;
  inheritedManualPoints: number | undefined;
  autoPointsPlaceholder: string;
  originalPointsProperty: string;
  originalMaxProperty: string;
  register: any;
  errors: any;
  setValue: any;
  resetAndSave: (field: string) => void;
  pointsValidation: any;
  nonNegativePointsValidation: any;
  homeworkAutoPointsValidation: any;
  homeworkMaxPointsValidation: any;
  formatPoints: (v: number | number[] | null | undefined) => string | undefined;
}) {
  const viewAutoPoints = formatPoints(autoPointsValue);
  const viewMaxAutoPoints = run(() => {
    if (isManualGrading) return undefined;
    const isDefault = maxAutoPointsValue == null;
    const effectiveMax = maxAutoPointsValue ?? autoPointsValue;
    if (effectiveMax == null) return undefined;
    const val = Array.isArray(effectiveMax) ? effectiveMax[0] : effectiveMax;
    return isDefault ? `${val} (default)` : String(val);
  });
  const viewManualPoints =
    !isManualGrading && manualPointsValue != null ? String(manualPointsValue) : undefined;

  return (
    <>
      {isAlternative ? (
        <InheritableField
          id={`${idPrefix}-autoPoints`}
          label={pointsLabel}
          inputType="number"
          step="any"
          editMode={editMode}
          isInherited={isPointsInherited}
          inheritedDisplayValue={formatPointsValue(inheritedPointsValue)}
          viewValue={!isPointsInherited ? viewAutoPoints : undefined}
          registerProps={register(originalPointsProperty, {
            setValueAs: coerceToNumber,
            deps: [originalMaxProperty, 'manualPoints'],
            validate: {
              atLeastOne: pointsValidation,
              crossField: homeworkAutoPointsValidation,
              nonNegative: (v: number | undefined) => nonNegativePointsValidation(v),
            },
          })}
          error={errors[originalPointsProperty]}
          helpText={
            isManualGrading
              ? 'Points for manual grading.'
              : 'Points awarded for the auto-graded component.'
          }
          inheritedValueLabel={formatPointsValue(inheritedPointsValue)}
          showResetButton={inheritedPointsValue != null && !isPointsInherited}
          onOverride={() =>
            setValue(originalPointsProperty, inheritedPointsValue, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          onReset={() => resetAndSave(originalPointsProperty)}
        />
      ) : (
        <FormField
          editMode={editMode}
          id={`${idPrefix}-autoPoints`}
          label={pointsLabel}
          viewValue={viewAutoPoints}
          error={errors[originalPointsProperty]}
          helpText={
            isManualGrading
              ? 'Points for manual grading.'
              : 'Points awarded for the auto-graded component.'
          }
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
                deps: [originalMaxProperty, 'manualPoints'],
                validate: {
                  atLeastOne: pointsValidation,
                  crossField: homeworkAutoPointsValidation,
                  nonNegative: (v: number | undefined) => nonNegativePointsValidation(v),
                },
              })}
            />
          )}
        </FormField>
      )}
      {!isManualGrading &&
        (isAlternative ? (
          <InheritableField
            id={`${idPrefix}-maxAutoPoints`}
            label="Max auto points"
            inputType="number"
            editMode={editMode}
            isInherited={isMaxInherited}
            inheritedDisplayValue={String(inheritedMaxValue ?? '')}
            viewValue={!isMaxInherited ? viewMaxAutoPoints : undefined}
            registerProps={register(originalMaxProperty, {
              setValueAs: coerceToNumber,
              deps: [originalPointsProperty],
              validate: homeworkMaxPointsValidation,
            })}
            error={errors[originalMaxProperty]}
            helpText="Maximum total auto-graded points. Defaults to auto points if not set."
            placeholder={autoPointsPlaceholder}
            inheritedValueLabel={inheritedMaxValue != null ? String(inheritedMaxValue) : undefined}
            showResetButton={inheritedMaxValue != null && !isMaxInherited}
            onOverride={() =>
              setValue(originalMaxProperty, inheritedMaxValue, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            onReset={() => resetAndSave(originalMaxProperty)}
          />
        ) : (
          <FormField
            editMode={editMode}
            id={`${idPrefix}-maxAutoPoints`}
            label="Max auto points"
            viewValue={viewMaxAutoPoints}
            error={errors[originalMaxProperty]}
            helpText="Maximum total auto-graded points. Defaults to auto points if not set."
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
                  deps: [originalPointsProperty],
                  validate: homeworkMaxPointsValidation,
                })}
              />
            )}
          </FormField>
        ))}
      {!isManualGrading &&
        (isAlternative ? (
          <InheritableField
            id={`${idPrefix}-manualPoints`}
            label="Manual points"
            inputType="number"
            editMode={editMode}
            isInherited={isManualPointsInherited}
            inheritedDisplayValue={String(inheritedManualPoints ?? '')}
            viewValue={
              !isManualPointsInherited && manualPointsValue != null
                ? String(manualPointsValue)
                : undefined
            }
            registerProps={register('manualPoints', {
              setValueAs: coerceToNumber,
              deps: [originalPointsProperty],
              validate: {
                atLeastOne: pointsValidation,
                nonNegative: nonNegativePointsValidation,
              },
            })}
            error={errors.manualPoints}
            helpText="Points awarded for the manually graded component."
            inheritedValueLabel={
              inheritedManualPoints != null ? String(inheritedManualPoints) : undefined
            }
            showResetButton={inheritedManualPoints != null && !isManualPointsInherited}
            onOverride={() =>
              setValue('manualPoints', inheritedManualPoints, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            onReset={() => resetAndSave('manualPoints')}
          />
        ) : (
          <FormField
            editMode={editMode}
            id={`${idPrefix}-manualPoints`}
            label="Manual points"
            viewValue={viewManualPoints}
            error={errors.manualPoints}
            helpText="Points awarded for the manually graded component."
            hideWhenEmpty
          >
            {(aria) => (
              <input
                type="number"
                className={clsx('form-control form-control-sm', aria.errorClass)}
                {...aria.inputProps}
                {...register('manualPoints', {
                  setValueAs: coerceToNumber,
                  deps: [originalPointsProperty],
                  validate: {
                    atLeastOne: pointsValidation,
                    nonNegative: nonNegativePointsValidation,
                  },
                })}
              />
            )}
          </FormField>
        ))}
    </>
  );
}

function ExamPointsFields({
  editMode,
  idPrefix,
  isAlternative,
  isManualGrading,
  pointsLabel,
  autoPointsValue,
  manualPointsValue,
  isPointsInherited,
  isManualPointsInherited,
  inheritedPointsValue,
  inheritedManualPoints,
  originalPointsProperty,
  register,
  errors,
  setValue,
  resetAndSave,
  pointsValidation,
  nonNegativePointsValidation,
  formatPoints,
}: {
  editMode: boolean;
  idPrefix: string;
  isAlternative: boolean;
  isManualGrading: boolean;
  pointsLabel: string;
  autoPointsValue: number | number[] | null | undefined;
  manualPointsValue: number | null | undefined;
  isPointsInherited: boolean;
  isManualPointsInherited: boolean;
  inheritedPointsValue: number | number[] | undefined;
  inheritedManualPoints: number | undefined;
  originalPointsProperty: string;
  register: any;
  errors: any;
  setValue: any;
  resetAndSave: (field: string) => void;
  pointsValidation: any;
  nonNegativePointsValidation: any;
  formatPoints: (v: number | number[] | null | undefined) => string | undefined;
}) {
  const viewAutoPoints = formatPoints(autoPointsValue);
  const viewManualPoints =
    !isManualGrading && manualPointsValue != null ? String(manualPointsValue) : undefined;

  return (
    <>
      {isAlternative ? (
        <InheritableField
          id={`${idPrefix}-pointsList`}
          label={pointsLabel}
          inputType="text"
          editMode={editMode}
          isInherited={isPointsInherited}
          inheritedDisplayValue={formatPointsValue(inheritedPointsValue)}
          viewValue={!isPointsInherited ? viewAutoPoints : undefined}
          registerProps={register(originalPointsProperty, {
            pattern: {
              value: /^[0-9, ]*$/,
              message: 'Points must be a number or a comma-separated list of numbers.',
            },
            setValueAs: parsePointsListValue,
            deps: ['manualPoints'],
            validate: {
              atLeastOne: pointsValidation,
              nonIncreasing: (v: number | number[] | undefined) => validateNonIncreasingPoints(v),
            },
          })}
          error={errors[originalPointsProperty]}
          helpText={
            isManualGrading
              ? 'Points for manual grading.'
              : 'Points for each attempt, as a comma-separated list (e.g. "10, 5, 2, 1").'
          }
          inheritedValueLabel={formatPointsValue(inheritedPointsValue)}
          showResetButton={inheritedPointsValue != null && !isPointsInherited}
          onOverride={() =>
            setValue(originalPointsProperty, inheritedPointsValue, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          onReset={() => resetAndSave(originalPointsProperty)}
        />
      ) : (
        <FormField
          editMode={editMode}
          id={`${idPrefix}-pointsList`}
          label={pointsLabel}
          viewValue={viewAutoPoints}
          error={errors[originalPointsProperty]}
          helpText={
            isManualGrading
              ? 'Points for manual grading.'
              : 'Points for each attempt, as a comma-separated list (e.g. "10, 5, 2, 1").'
          }
          hideWhenEmpty
        >
          {(aria) => (
            <input
              type="text"
              className={clsx('form-control form-control-sm', aria.errorClass)}
              {...aria.inputProps}
              {...register(originalPointsProperty, {
                pattern: {
                  value: /^[0-9, ]*$/,
                  message: 'Points must be a number or a comma-separated list of numbers.',
                },
                setValueAs: parsePointsListValue,
                deps: ['manualPoints'],
                validate: {
                  atLeastOne: pointsValidation,
                  nonIncreasing: (v: number | number[] | undefined) =>
                    validateNonIncreasingPoints(v),
                },
              })}
            />
          )}
        </FormField>
      )}
      {!isManualGrading &&
        (isAlternative ? (
          <InheritableField
            id={`${idPrefix}-manualPoints`}
            label="Manual points"
            inputType="number"
            editMode={editMode}
            isInherited={isManualPointsInherited}
            inheritedDisplayValue={String(inheritedManualPoints ?? '')}
            viewValue={
              !isManualPointsInherited && manualPointsValue != null
                ? String(manualPointsValue)
                : undefined
            }
            registerProps={register('manualPoints', {
              setValueAs: coerceToNumber,
              deps: [originalPointsProperty],
              validate: {
                atLeastOne: pointsValidation,
                nonNegative: nonNegativePointsValidation,
              },
            })}
            error={errors.manualPoints}
            helpText="Points awarded for the manually graded component."
            inheritedValueLabel={
              inheritedManualPoints != null ? String(inheritedManualPoints) : undefined
            }
            showResetButton={inheritedManualPoints != null && !isManualPointsInherited}
            onOverride={() =>
              setValue('manualPoints', inheritedManualPoints, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            onReset={() => resetAndSave('manualPoints')}
          />
        ) : (
          <FormField
            editMode={editMode}
            id={`${idPrefix}-manualPoints`}
            label="Manual points"
            viewValue={viewManualPoints}
            error={errors.manualPoints}
            helpText="Points awarded for the manually graded component."
            hideWhenEmpty
          >
            {(aria) => (
              <input
                type="number"
                className={clsx('form-control form-control-sm', aria.errorClass)}
                {...aria.inputProps}
                {...register('manualPoints', {
                  setValueAs: coerceToNumber,
                  deps: [originalPointsProperty],
                  validate: {
                    atLeastOne: pointsValidation,
                    nonNegative: nonNegativePointsValidation,
                  },
                })}
              />
            )}
          </FormField>
        ))}
    </>
  );
}
