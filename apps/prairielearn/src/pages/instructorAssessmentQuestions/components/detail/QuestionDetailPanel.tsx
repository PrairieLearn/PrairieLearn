import clsx from 'clsx';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { CopyButton } from '../../../../components/CopyButton.js';
import { HistMini } from '../../../../components/HistMini.js';
import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type {
  QuestionAlternativeForm,
  SelectedItem,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../../types.js';
import {
  type AssessmentAdvancedDefaults,
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

import type { AdvancedFieldsInheritance } from './AdvancedFields.js';
import { AdvancedFields } from './AdvancedFields.js';
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
  editMode,
  assessmentType,
  assessmentDefaults,
  urlPrefix,
  hasCoursePermissionPreview,
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
  editMode: boolean;
  assessmentType: EnumAssessmentType;
  assessmentDefaults: AssessmentAdvancedDefaults;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
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
  const isAlternative = !!zoneQuestionBlock;

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

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave });

  const advancedInheritance: AdvancedFieldsInheritance = run(() => {
    if (isAlternative) {
      // Alternatives inherit from alt group → zone → assessment
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
      const inheritedFromLabel =
        zoneQuestionBlock.advanceScorePerc != null ||
        zoneQuestionBlock.gradeRateMinutes != null ||
        zoneQuestionBlock.allowRealTimeGrading != null ||
        zoneQuestionBlock.forceMaxPoints != null
          ? 'group'
          : zone?.advanceScorePerc != null ||
              zone?.gradeRateMinutes != null ||
              zone?.allowRealTimeGrading != null
            ? 'zone'
            : 'assessment';
      return {
        parentAdvanceScorePerc,
        parentGradeRateMinutes,
        parentAllowRealTimeGrading,
        parentForceMaxPoints,
        inheritedFromLabel,
        watch,
        setValue,
        getValues,
        onSave: handleSave,
      };
    }
    // Standalone questions inherit from zone → assessment
    const parentAdvanceScorePerc = zone?.advanceScorePerc ?? assessmentDefaults.advanceScorePerc;
    const parentGradeRateMinutes = zone?.gradeRateMinutes ?? assessmentDefaults.gradeRateMinutes;
    const parentAllowRealTimeGrading =
      zone?.allowRealTimeGrading ?? assessmentDefaults.allowRealTimeGrading;
    const inheritedFromLabel =
      zone?.advanceScorePerc != null ||
      zone?.gradeRateMinutes != null ||
      zone?.allowRealTimeGrading != null
        ? 'zone'
        : 'assessment';
    return {
      parentAdvanceScorePerc,
      parentGradeRateMinutes,
      parentAllowRealTimeGrading,
      parentForceMaxPoints: undefined,
      inheritedFromLabel,
      watch,
      setValue,
      getValues,
      onSave: handleSave,
    };
  });

  if (!editMode) {
    return (
      <div className="p-3">
        {questionData && (
          <div className="mb-3">
            <div className="fw-semibold mb-1">
              {hasCoursePermissionPreview ? (
                <a href={`${urlPrefix}/question/${questionData.question.id}/`}>
                  {questionData.question.title}
                </a>
              ) : (
                questionData.question.title
              )}
            </div>
            <span className="d-inline-flex align-items-center">
              <code className="text-muted small">{question.id}</code>
              {question.id && (
                <CopyButton text={question.id} tooltipId="copy-qid" ariaLabel="Copy QID" />
              )}
            </span>
            <div className="d-flex flex-wrap gap-1 mt-2">
              <span className={`badge color-${questionData.topic.color}`}>
                {questionData.topic.name}
              </span>
              {questionData.tags?.map((tag) => (
                <span key={tag.name} className={`badge color-${tag.color}`}>
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}
        <dl className="mb-0">
          {autoPointsValue != null && (
            <>
              <dt>{assessmentType === 'Exam' ? 'Points' : 'Auto points'}</dt>
              <dd>
                {Array.isArray(autoPointsValue) ? autoPointsValue.join(', ') : autoPointsValue}
              </dd>
            </>
          )}
          {run(() => {
            if (assessmentType !== 'Homework') return null;
            const isDefault = maxAutoPointsValue == null;
            const effectiveMax = maxAutoPointsValue ?? autoPointsValue;
            if (effectiveMax == null) return null;
            return (
              <>
                <dt>Max auto points</dt>
                <dd>
                  {Array.isArray(effectiveMax) ? effectiveMax[0] : effectiveMax}
                  {isDefault && <span className="text-muted"> (default)</span>}
                </dd>
              </>
            );
          })}
          {manualPointsValue != null && (
            <>
              <dt>Manual points</dt>
              <dd>{manualPointsValue}</dd>
            </>
          )}
          {question.triesPerVariant != null && (
            <>
              <dt>Tries per variant</dt>
              <dd>{question.triesPerVariant}</dd>
            </>
          )}
          {question.comment != null && (
            <>
              <dt>Comment</dt>
              <dd className="text-break">{String(question.comment)}</dd>
            </>
          )}
          {run(() => {
            const effective =
              question.advanceScorePerc ?? advancedInheritance.parentAdvanceScorePerc;
            if (effective == null) return null;
            const isInherited = question.advanceScorePerc == null;
            return (
              <>
                <dt>Advance score %</dt>
                <dd>
                  {effective}%
                  {isInherited && (
                    <span className="text-muted">
                      {' '}
                      (inherited from {advancedInheritance.inheritedFromLabel})
                    </span>
                  )}
                </dd>
              </>
            );
          })}
          {run(() => {
            const effective =
              question.gradeRateMinutes ?? advancedInheritance.parentGradeRateMinutes;
            if (effective == null) return null;
            const isInherited = question.gradeRateMinutes == null;
            return (
              <>
                <dt>Grade rate (minutes)</dt>
                <dd>
                  {effective}
                  {isInherited && (
                    <span className="text-muted">
                      {' '}
                      (inherited from {advancedInheritance.inheritedFromLabel})
                    </span>
                  )}
                </dd>
              </>
            );
          })}
          {run(() => {
            const effective = question.forceMaxPoints ?? advancedInheritance.parentForceMaxPoints;
            if (effective == null) return null;
            const isInherited = question.forceMaxPoints == null;
            return (
              <>
                <dt>Force max points</dt>
                <dd>
                  {effective ? 'Yes' : 'No'}
                  {isInherited && (
                    <span className="text-muted">
                      {' '}
                      (inherited from {advancedInheritance.inheritedFromLabel})
                    </span>
                  )}
                </dd>
              </>
            );
          })}
          {run(() => {
            const effective =
              question.allowRealTimeGrading ?? advancedInheritance.parentAllowRealTimeGrading;
            if (effective == null) return null;
            const isInherited = question.allowRealTimeGrading == null;
            return (
              <>
                <dt>Allow real-time grading</dt>
                <dd>
                  {effective ? 'Yes' : 'No'}
                  {isInherited && (
                    <span className="text-muted">
                      {' '}
                      (inherited from {advancedInheritance.inheritedFromLabel})
                    </span>
                  )}
                </dd>
              </>
            );
          })}
        </dl>
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
        {questionData && (
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => onResetButtonClick(questionData.assessment_question.id)}
            >
              Reset question variants
            </button>
          </div>
        )}
      </div>
    );
  }

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

  return (
    <div className="p-3">
      {questionData && (
        <div className="mb-3">
          <div className="fw-semibold mb-1">
            {hasCoursePermissionPreview ? (
              <a href={`${urlPrefix}/question/${questionData.question.id}/`}>
                {questionData.question.title}
              </a>
            ) : (
              questionData.question.title
            )}
          </div>
          <div className="d-flex flex-wrap gap-1 mt-2">
            <span className={`badge color-${questionData.topic.color}`}>
              {questionData.topic.name}
            </span>
            {questionData.tags?.map((tag) => (
              <span key={tag.name} className={`badge color-${tag.color}`}>
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      )}
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

      {assessmentType === 'Homework' ? (
        <>
          {isAlternative ? (
            <InheritableField
              id={`${idPrefix}-autoPoints`}
              label="Auto points"
              inputType="number"
              step="any"
              isInherited={isPointsInherited}
              inheritedDisplayValue={formatPointsValue(inheritedPointsValue)}
              registerProps={register(originalPointsProperty, {
                setValueAs: coerceToNumber,
                deps: [originalMaxProperty, 'manualPoints'],
                validate: {
                  atLeastOne: pointsValidation,
                  crossField: homeworkAutoPointsValidation,
                  nonNegative: (v) => nonNegativePointsValidation(v as number | undefined),
                },
              })}
              error={errors[originalPointsProperty]}
              helpText="Points awarded for the auto-graded component."
              inheritedValueLabel={formatPointsValue(inheritedPointsValue)}
              showResetButton={inheritedPointsValue != null}
              onOverride={() =>
                setValue(originalPointsProperty, inheritedPointsValue, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              // Directly save instead of setValue(field, undefined) because
              // RHF does not reliably trigger dirty-state changes for undefined.
              onReset={() => handleSave({ ...getValues(), [originalPointsProperty]: undefined })}
            />
          ) : (
            <div className="mb-3">
              <label htmlFor={`${idPrefix}-autoPoints`} className="form-label">
                Auto points
              </label>
              <input
                type="number"
                className={clsx(
                  'form-control form-control-sm',
                  errors[originalPointsProperty] && 'is-invalid',
                )}
                id={`${idPrefix}-autoPoints`}
                aria-invalid={!!errors[originalPointsProperty]}
                aria-errormessage={
                  errors[originalPointsProperty] ? `${idPrefix}-autoPoints-error` : undefined
                }
                aria-describedby={`${idPrefix}-autoPoints-help`}
                step="any"
                {...register(originalPointsProperty, {
                  setValueAs: coerceToNumber,
                  deps: [originalMaxProperty, 'manualPoints'],
                  validate: {
                    atLeastOne: pointsValidation,
                    crossField: homeworkAutoPointsValidation,
                    nonNegative: (v) => nonNegativePointsValidation(v as number | undefined),
                  },
                })}
              />
              {errors[originalPointsProperty] && (
                <div id={`${idPrefix}-autoPoints-error`} className="invalid-feedback">
                  {errors[originalPointsProperty].message}
                </div>
              )}
              <small id={`${idPrefix}-autoPoints-help`} className="form-text text-muted">
                Points awarded for the auto-graded component.
              </small>
            </div>
          )}
          {isAlternative ? (
            <InheritableField
              id={`${idPrefix}-maxAutoPoints`}
              label="Max auto points"
              inputType="number"
              isInherited={isMaxInherited}
              inheritedDisplayValue={String(inheritedMaxValue ?? '')}
              registerProps={register(originalMaxProperty, {
                setValueAs: coerceToNumber,
                deps: [originalPointsProperty],
                validate: homeworkMaxPointsValidation,
              })}
              error={errors[originalMaxProperty]}
              helpText="Maximum total auto-graded points. Defaults to auto points if not set."
              placeholder={autoPointsPlaceholder}
              inheritedValueLabel={String(inheritedMaxValue ?? '')}
              showResetButton={inheritedMaxValue != null}
              onOverride={() =>
                setValue(originalMaxProperty, inheritedMaxValue, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              // Directly save instead of setValue(field, undefined) because
              // RHF does not reliably trigger dirty-state changes for undefined.
              onReset={() => handleSave({ ...getValues(), [originalMaxProperty]: undefined })}
            />
          ) : (
            <div className="mb-3">
              <label htmlFor={`${idPrefix}-maxAutoPoints`} className="form-label">
                Max auto points
              </label>
              <input
                type="number"
                className={clsx(
                  'form-control form-control-sm',
                  errors[originalMaxProperty] && 'is-invalid',
                )}
                id={`${idPrefix}-maxAutoPoints`}
                aria-invalid={!!errors[originalMaxProperty]}
                aria-errormessage={
                  errors[originalMaxProperty] ? `${idPrefix}-maxAutoPoints-error` : undefined
                }
                aria-describedby={`${idPrefix}-maxAutoPoints-help`}
                placeholder={autoPointsPlaceholder}
                {...register(originalMaxProperty, {
                  setValueAs: coerceToNumber,
                  deps: [originalPointsProperty],
                  validate: homeworkMaxPointsValidation,
                })}
              />
              {errors[originalMaxProperty] && (
                <div id={`${idPrefix}-maxAutoPoints-error`} className="invalid-feedback">
                  {errors[originalMaxProperty].message}
                </div>
              )}
              <small id={`${idPrefix}-maxAutoPoints-help`} className="form-text text-muted">
                Maximum total auto-graded points. Defaults to auto points if not set.
              </small>
            </div>
          )}
          {isAlternative ? (
            <InheritableField
              id={`${idPrefix}-manualPoints`}
              label="Manual points"
              inputType="number"
              isInherited={isManualPointsInherited}
              inheritedDisplayValue={String(inheritedManualPoints ?? '')}
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
              inheritedValueLabel={String(inheritedManualPoints ?? '')}
              showResetButton={inheritedManualPoints != null}
              onOverride={() =>
                setValue('manualPoints', inheritedManualPoints, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              // Directly save instead of setValue(field, undefined) because
              // RHF does not reliably trigger dirty-state changes for undefined.
              onReset={() => handleSave({ ...getValues(), manualPoints: undefined })}
            />
          ) : (
            <div className="mb-3">
              <label htmlFor={`${idPrefix}-manualPoints`} className="form-label">
                Manual points
              </label>
              <input
                type="number"
                className={clsx(
                  'form-control form-control-sm',
                  errors.manualPoints && 'is-invalid',
                )}
                id={`${idPrefix}-manualPoints`}
                aria-invalid={!!errors.manualPoints}
                aria-errormessage={
                  errors.manualPoints ? `${idPrefix}-manualPoints-error` : undefined
                }
                aria-describedby={`${idPrefix}-manualPoints-help`}
                {...register('manualPoints', {
                  setValueAs: coerceToNumber,
                  deps: [originalPointsProperty],
                  validate: {
                    atLeastOne: pointsValidation,
                    nonNegative: nonNegativePointsValidation,
                  },
                })}
              />
              {errors.manualPoints && (
                <div id={`${idPrefix}-manualPoints-error`} className="invalid-feedback">
                  {errors.manualPoints.message}
                </div>
              )}
              <small id={`${idPrefix}-manualPoints-help`} className="form-text text-muted">
                Points awarded for the manually graded component.
              </small>
            </div>
          )}
          <div className="mb-3">
            <label htmlFor={`${idPrefix}-triesPerVariant`} className="form-label">
              Tries per variant
            </label>
            <input
              type="number"
              className={clsx(
                'form-control form-control-sm',
                errors.triesPerVariant && 'is-invalid',
              )}
              id={`${idPrefix}-triesPerVariant`}
              aria-invalid={!!errors.triesPerVariant}
              aria-errormessage={
                errors.triesPerVariant ? `${idPrefix}-triesPerVariant-error` : undefined
              }
              aria-describedby={`${idPrefix}-triesPerVariant-help`}
              {...register('triesPerVariant', {
                setValueAs: coerceToNumber,
                validate: (v) => validatePositiveInteger(v, 'Tries per variant'),
              })}
            />
            {errors.triesPerVariant && (
              <div id={`${idPrefix}-triesPerVariant-error`} className="invalid-feedback">
                {errors.triesPerVariant.message}
              </div>
            )}
            <small id={`${idPrefix}-triesPerVariant-help`} className="form-text text-muted">
              Number of submission attempts allowed per question variant.
            </small>
          </div>
        </>
      ) : (
        <>
          {isAlternative ? (
            <InheritableField
              id={`${idPrefix}-pointsList`}
              label="Points list"
              inputType="text"
              isInherited={isPointsInherited}
              inheritedDisplayValue={formatPointsValue(inheritedPointsValue)}
              registerProps={register(originalPointsProperty, {
                pattern: {
                  value: /^[0-9, ]*$/,
                  message: 'Points must be a number or a comma-separated list of numbers.',
                },
                setValueAs: parsePointsListValue,
                deps: ['manualPoints'],
                validate: {
                  atLeastOne: pointsValidation,
                  nonIncreasing: (v) => validateNonIncreasingPoints(v),
                },
              })}
              error={errors[originalPointsProperty]}
              helpText='Points for each attempt, as a comma-separated list (e.g. "10, 5, 2, 1").'
              inheritedValueLabel={formatPointsValue(inheritedPointsValue)}
              showResetButton={inheritedPointsValue != null}
              onOverride={() =>
                setValue(originalPointsProperty, inheritedPointsValue, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              // Directly save instead of setValue(field, undefined) because
              // RHF does not reliably trigger dirty-state changes for undefined.
              onReset={() => handleSave({ ...getValues(), [originalPointsProperty]: undefined })}
            />
          ) : (
            <div className="mb-3">
              <label htmlFor={`${idPrefix}-pointsList`} className="form-label">
                Points list
              </label>
              <input
                type="text"
                className={clsx(
                  'form-control form-control-sm',
                  errors[originalPointsProperty] && 'is-invalid',
                )}
                id={`${idPrefix}-pointsList`}
                aria-invalid={!!errors[originalPointsProperty]}
                aria-errormessage={
                  errors[originalPointsProperty] ? `${idPrefix}-pointsList-error` : undefined
                }
                aria-describedby={`${idPrefix}-pointsList-help`}
                {...register(originalPointsProperty, {
                  pattern: {
                    value: /^[0-9, ]*$/,
                    message: 'Points must be a number or a comma-separated list of numbers.',
                  },
                  setValueAs: parsePointsListValue,
                  deps: ['manualPoints'],
                  validate: {
                    atLeastOne: pointsValidation,
                    nonIncreasing: (v) => validateNonIncreasingPoints(v),
                  },
                })}
              />
              {errors[originalPointsProperty] && (
                <div id={`${idPrefix}-pointsList-error`} className="invalid-feedback">
                  {errors[originalPointsProperty].message}
                </div>
              )}
              <small id={`${idPrefix}-pointsList-help`} className="form-text text-muted">
                Points for each attempt, as a comma-separated list (e.g. "10, 5, 2, 1").
              </small>
            </div>
          )}
          {isAlternative ? (
            <InheritableField
              id={`${idPrefix}-manualPoints`}
              label="Manual points"
              inputType="number"
              isInherited={isManualPointsInherited}
              inheritedDisplayValue={String(inheritedManualPoints ?? '')}
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
              inheritedValueLabel={String(inheritedManualPoints ?? '')}
              showResetButton={inheritedManualPoints != null}
              onOverride={() =>
                setValue('manualPoints', inheritedManualPoints, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              // Directly save instead of setValue(field, undefined) because
              // RHF does not reliably trigger dirty-state changes for undefined.
              onReset={() => handleSave({ ...getValues(), manualPoints: undefined })}
            />
          ) : (
            <div className="mb-3">
              <label htmlFor={`${idPrefix}-manualPoints`} className="form-label">
                Manual points
              </label>
              <input
                type="number"
                className={clsx(
                  'form-control form-control-sm',
                  errors.manualPoints && 'is-invalid',
                )}
                id={`${idPrefix}-manualPoints`}
                aria-invalid={!!errors.manualPoints}
                aria-errormessage={
                  errors.manualPoints ? `${idPrefix}-manualPoints-error` : undefined
                }
                aria-describedby={`${idPrefix}-manualPoints-help`}
                {...register('manualPoints', {
                  setValueAs: coerceToNumber,
                  deps: [originalPointsProperty],
                  validate: {
                    atLeastOne: pointsValidation,
                    nonNegative: nonNegativePointsValidation,
                  },
                })}
              />
              {errors.manualPoints && (
                <div id={`${idPrefix}-manualPoints-error`} className="invalid-feedback">
                  {errors.manualPoints.message}
                </div>
              )}
              <small id={`${idPrefix}-manualPoints-help`} className="form-text text-muted">
                Points awarded for the manually graded component.
              </small>
            </div>
          )}
        </>
      )}

      <div className="mb-3">
        <label htmlFor={`${idPrefix}-comment`} className="form-label">
          Comment
        </label>
        <textarea
          className="form-control form-control-sm"
          id={`${idPrefix}-comment`}
          aria-describedby={`${idPrefix}-comment-help`}
          rows={2}
          {...register('comment')}
        />
        <small id={`${idPrefix}-comment-help`} className="form-text text-muted">
          Internal note, not shown to students.
        </small>
      </div>

      <AdvancedFields
        register={register}
        errors={errors}
        idPrefix={idPrefix}
        variant="question"
        inheritance={advancedInheritance}
      />

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

      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={() => onDelete(questionTrackingId, question.id ?? '', alternativeTrackingId)}
        >
          Delete
        </button>
        {questionData && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onResetButtonClick(questionData.assessment_question.id)}
          >
            Reset question variants
          </button>
        )}
      </div>
    </div>
  );
}
