import clsx from 'clsx';
import { useCallback, useMemo } from 'react';
import {
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  useForm,
} from 'react-hook-form';

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
    constantQuestionValue,
    assessmentDefaults,
    courseInstanceId,
    hasCoursePermissionPreview,
  } = state;
  const isAlternative = !!zoneQuestionBlock;
  const isManualGrading = questionData?.question.grading_method === 'Manual';

  const pointsProperty = assessmentType === 'Exam' ? 'points' : 'autoPoints';
  const maxPointsProperty = assessmentType === 'Exam' ? 'maxPoints' : 'maxAutoPoints';

  // For read-only display, use merged values (own ?? inherited)
  const autoPointsValue = question[pointsProperty] ?? zoneQuestionBlock?.[pointsProperty];
  const maxAutoPointsValue = question[maxPointsProperty] ?? zoneQuestionBlock?.[maxPointsProperty];
  const manualPointsValue = question.manualPoints ?? zoneQuestionBlock?.manualPoints;

  // Alternative's own values (may be undefined = inheriting from group)
  const ownPointsValue = question[pointsProperty] ?? undefined;
  const ownMaxValue = question[maxPointsProperty] ?? undefined;
  const ownManualPoints = question.manualPoints ?? undefined;

  // Group's values (what would be inherited)
  const inheritedPointsValue = zoneQuestionBlock?.[pointsProperty] ?? undefined;
  const inheritedMaxValue = zoneQuestionBlock?.[maxPointsProperty] ?? undefined;
  const inheritedManualPoints = zoneQuestionBlock?.manualPoints ?? undefined;

  const parentValues = isAlternative
    ? {
        [pointsProperty]: inheritedPointsValue,
        [maxPointsProperty]: inheritedMaxValue,
        manualPoints: inheritedManualPoints,
      }
    : undefined;

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
      [pointsProperty]: isAlternative ? ownPointsValue : (autoPointsValue ?? undefined),
      [maxPointsProperty]: isAlternative ? ownMaxValue : (maxAutoPointsValue ?? undefined),
      manualPoints: isAlternative ? ownManualPoints : (manualPointsValue ?? undefined),
      triesPerVariant: question.triesPerVariant ?? undefined,
      advanceScorePerc: question.advanceScorePerc ?? undefined,
      gradeRateMinutes: question.gradeRateMinutes ?? undefined,
      forceMaxPoints: question.forceMaxPoints ?? (hasForceMaxPointsParent ? undefined : false),
      allowRealTimeGrading: question.allowRealTimeGrading ?? undefined,
    },
  });

  const watchedPoints = watch(pointsProperty);
  const watchedMax = watch(maxPointsProperty);
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

  const pointsValidation = (_value: unknown, formValues: QuestionFormData) =>
    validateAtLeastOnePointsField(formValues, parentValues);

  const nonNegativePointsValidation = (v: number | number[] | undefined) => {
    if (typeof v === 'number' && v < 0) return 'Points must be non-negative.';
  };

  const homeworkAutoPointsValidation = (_value: unknown, formValues: QuestionFormData) => {
    const points = formValues[pointsProperty];
    const maxPoints = formValues[maxPointsProperty];
    if (typeof points === 'number' && points === 0 && maxPoints != null && maxPoints > 0) {
      return 'Auto points cannot be 0 when max auto points is greater than 0.';
    }
    if (typeof points === 'number' && typeof maxPoints === 'number' && points > maxPoints) {
      return 'Auto points cannot exceed max auto points.';
    }
    return pointsValidation(_value, formValues);
  };

  const homeworkMaxPointsValidation = (_value: unknown, formValues: QuestionFormData) => {
    const points = formValues[pointsProperty];
    const maxPoints = formValues[maxPointsProperty];
    if (typeof points === 'number' && points === 0 && maxPoints != null && maxPoints > 0) {
      return 'Max auto points must be 0 or empty when auto points is 0.';
    }
    if (typeof points === 'number' && typeof maxPoints === 'number' && maxPoints < points) {
      return 'Max auto points must be at least auto points.';
    }
    if (maxPoints != null && maxPoints < 0) return 'Max auto points must be non-negative.';
  };

  const pointsLabel = isManualGrading
    ? 'Points (manual)'
    : assessmentType === 'Exam'
      ? 'Points'
      : 'Auto points';

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
        {assessmentType === 'Homework' ? (
          <HomeworkPointsFields
            editMode={editMode}
            idPrefix={idPrefix}
            isAlternative={isAlternative}
            isManualGrading={isManualGrading}
            constantQuestionValue={constantQuestionValue}
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
            pointsProperty={pointsProperty}
            maxPointsProperty={maxPointsProperty}
            register={register}
            errors={errors}
            setValue={setValue}
            resetAndSave={resetAndSave}
            pointsValidation={pointsValidation}
            nonNegativePointsValidation={nonNegativePointsValidation}
            homeworkAutoPointsValidation={homeworkAutoPointsValidation}
            homeworkMaxPointsValidation={homeworkMaxPointsValidation}
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
            pointsProperty={pointsProperty}
            register={register}
            errors={errors}
            setValue={setValue}
            resetAndSave={resetAndSave}
            pointsValidation={pointsValidation}
            nonNegativePointsValidation={nonNegativePointsValidation}
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
  constantQuestionValue,
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
  pointsProperty,
  maxPointsProperty,
  register,
  errors,
  setValue,
  resetAndSave,
  pointsValidation,
  nonNegativePointsValidation,
  homeworkAutoPointsValidation,
  homeworkMaxPointsValidation,
}: {
  editMode: boolean;
  idPrefix: string;
  isAlternative: boolean;
  isManualGrading: boolean;
  constantQuestionValue: boolean;
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
  pointsProperty: 'points' | 'autoPoints';
  maxPointsProperty: 'maxPoints' | 'maxAutoPoints';
  register: UseFormRegister<QuestionFormData>;
  errors: FieldErrors<QuestionFormData>;
  setValue: UseFormSetValue<QuestionFormData>;
  resetAndSave: (field: string) => void;
  pointsValidation: (value: unknown, formValues: QuestionFormData) => string | undefined;
  nonNegativePointsValidation: (v: number | number[] | undefined) => string | undefined;
  homeworkAutoPointsValidation: (
    value: unknown,
    formValues: QuestionFormData,
  ) => string | undefined;
  homeworkMaxPointsValidation: (value: unknown, formValues: QuestionFormData) => string | undefined;
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

  const maxAutoPointsHelpText = constantQuestionValue ? (
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
      Maximum total auto-graded points. Each consecutive correct answer is worth more; an incorrect
      answer resets the value.{' '}
      <a
        href="https://docs.prairielearn.com/assessment/configuration/#question-points-for-homework-assessments"
        target="_blank"
        rel="noreferrer"
      >
        Learn more about question points
      </a>
    </>
  );

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
          registerProps={register(pointsProperty, {
            setValueAs: coerceToNumber,
            deps: [maxPointsProperty, 'manualPoints'],
            validate: {
              atLeastOne: pointsValidation,
              crossField: homeworkAutoPointsValidation,
              nonNegative: (v: number | number[] | undefined) => nonNegativePointsValidation(v),
            },
          })}
          error={errors[pointsProperty]}
          helpText={
            isManualGrading
              ? 'Points for manual grading.'
              : 'Points awarded for the auto-graded component.'
          }
          inheritedValueLabel={formatPointsValue(inheritedPointsValue)}
          showResetButton={inheritedPointsValue != null && !isPointsInherited}
          onOverride={() =>
            setValue(pointsProperty, inheritedPointsValue, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          onReset={() => resetAndSave(pointsProperty)}
        />
      ) : (
        <FormField
          editMode={editMode}
          id={`${idPrefix}-autoPoints`}
          label={pointsLabel}
          viewValue={viewAutoPoints}
          error={errors[pointsProperty]}
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
              {...register(pointsProperty, {
                setValueAs: coerceToNumber,
                deps: [maxPointsProperty, 'manualPoints'],
                validate: {
                  atLeastOne: pointsValidation,
                  crossField: homeworkAutoPointsValidation,
                  nonNegative: (v: number | number[] | undefined) => nonNegativePointsValidation(v),
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
            step="any"
            editMode={editMode}
            isInherited={isMaxInherited}
            inheritedDisplayValue={String(inheritedMaxValue ?? '')}
            viewValue={!isMaxInherited ? viewMaxAutoPoints : undefined}
            registerProps={register(maxPointsProperty, {
              setValueAs: coerceToNumber,
              deps: [pointsProperty],
              validate: homeworkMaxPointsValidation,
            })}
            error={errors[maxPointsProperty]}
            helpText={maxAutoPointsHelpText}
            placeholder={autoPointsPlaceholder}
            inheritedValueLabel={inheritedMaxValue != null ? String(inheritedMaxValue) : undefined}
            showResetButton={inheritedMaxValue != null && !isMaxInherited}
            onOverride={() =>
              setValue(maxPointsProperty, inheritedMaxValue, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            onReset={() => resetAndSave(maxPointsProperty)}
          />
        ) : (
          <FormField
            editMode={editMode}
            id={`${idPrefix}-maxAutoPoints`}
            label="Max auto points"
            viewValue={viewMaxAutoPoints}
            error={errors[maxPointsProperty]}
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
                {...register(maxPointsProperty, {
                  setValueAs: coerceToNumber,
                  deps: [pointsProperty],
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
            step="any"
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
              deps: [pointsProperty],
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
                step="any"
                className={clsx('form-control form-control-sm', aria.errorClass)}
                {...aria.inputProps}
                {...register('manualPoints', {
                  setValueAs: coerceToNumber,
                  deps: [pointsProperty],
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
  pointsProperty,
  register,
  errors,
  setValue,
  resetAndSave,
  pointsValidation,
  nonNegativePointsValidation,
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
  pointsProperty: 'points' | 'autoPoints';
  register: UseFormRegister<QuestionFormData>;
  errors: FieldErrors<QuestionFormData>;
  setValue: UseFormSetValue<QuestionFormData>;
  resetAndSave: (field: string) => void;
  pointsValidation: (value: unknown, formValues: QuestionFormData) => string | undefined;
  nonNegativePointsValidation: (v: number | number[] | undefined) => string | undefined;
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
          registerProps={register(pointsProperty, {
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
          })}
          error={errors[pointsProperty]}
          helpText={
            isManualGrading
              ? 'Points for manual grading.'
              : 'Points for each attempt, as a comma-separated list (e.g. "10, 5, 2, 1").'
          }
          inheritedValueLabel={formatPointsValue(inheritedPointsValue)}
          showResetButton={inheritedPointsValue != null && !isPointsInherited}
          onOverride={() =>
            setValue(pointsProperty, inheritedPointsValue, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          onReset={() => resetAndSave(pointsProperty)}
        />
      ) : (
        <FormField
          editMode={editMode}
          id={`${idPrefix}-pointsList`}
          label={pointsLabel}
          viewValue={viewAutoPoints}
          error={errors[pointsProperty]}
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
              {...register(pointsProperty, {
                pattern: {
                  value: /^[0-9., ]*$/,
                  message: 'Points must be a number or a comma-separated list of numbers.',
                },
                setValueAs: parsePointsListValue,
                deps: ['manualPoints'],
                validate: {
                  atLeastOne: pointsValidation,
                  format: (v: number | number[] | string | undefined) =>
                    validatePointsListFormat(v),
                  nonIncreasing: (v: number | number[] | string | undefined) =>
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
            step="any"
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
              deps: [pointsProperty],
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
                step="any"
                className={clsx('form-control form-control-sm', aria.errorClass)}
                {...aria.inputProps}
                {...register('manualPoints', {
                  setValueAs: coerceToNumber,
                  deps: [pointsProperty],
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
