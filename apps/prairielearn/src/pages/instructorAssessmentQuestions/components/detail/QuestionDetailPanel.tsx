import clsx from 'clsx';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { CopyButton } from '../../../../components/CopyButton.js';
import { HistMini } from '../../../../components/HistMini.js';
import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { QuestionAlternativeForm, SelectedItem, ZoneQuestionBlockForm } from '../../types.js';
import {
  coerceToNumber,
  extractStringComment,
  parsePointsListValue,
  validateAtLeastOnePointsField,
} from '../../utils/formHelpers.js';
import { validatePositiveInteger } from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';

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

function formatPointsValue(value: number | number[] | undefined | null): string {
  if (value == null) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function QuestionDetailPanel({
  question,
  zoneQuestionBlock,
  questionData,
  editMode,
  assessmentType,
  urlPrefix,
  hasCoursePermissionPreview,
  onUpdate,
  onDelete,
  onPickQuestion,
  onResetButtonClick,
}: {
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock?: ZoneQuestionBlockForm;
  questionData: StaffAssessmentQuestionRow | null;
  editMode: boolean;
  assessmentType: EnumAssessmentType;
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

  const originalPointsProperty = run(() => {
    if (question.points != null) return 'points' as const;
    if (question.autoPoints != null) return 'autoPoints' as const;
    if (zoneQuestionBlock) {
      if (zoneQuestionBlock.points != null) return 'points' as const;
      if (zoneQuestionBlock.autoPoints != null) return 'autoPoints' as const;
    }
    return 'autoPoints' as const;
  });

  const originalMaxProperty = run(() => {
    if (question.maxAutoPoints != null) return 'maxAutoPoints' as const;
    if (question.maxPoints != null) return 'maxPoints' as const;
    if (zoneQuestionBlock) {
      if (zoneQuestionBlock.maxAutoPoints != null) return 'maxAutoPoints' as const;
      if (zoneQuestionBlock.maxPoints != null) return 'maxPoints' as const;
    }
    return originalPointsProperty === 'points'
      ? ('maxPoints' as const)
      : ('maxAutoPoints' as const);
  });

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
          {maxAutoPointsValue != null && (
            <>
              <dt>Max auto points</dt>
              <dd>{maxAutoPointsValue}</dd>
            </>
          )}
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
          {/* TODO: Display inherited values from zone/alt group */}
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

  return (
    <div className="p-3">
      <div className="mb-3">
        <label htmlFor="question-id" className="form-label">
          QID
        </label>
        <div className="input-group input-group-sm">
          <input
            type="text"
            className={clsx('form-control', errors.id && 'is-invalid')}
            id="question-id"
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
            Pick
          </button>
        </div>
      </div>

      {assessmentType === 'Homework' ? (
        <>
          {isAlternative ? (
            <InheritableField
              id="question-autoPoints"
              label="Auto points"
              inputType="number"
              step="any"
              isInherited={isPointsInherited}
              inheritedDisplayValue={formatPointsValue(inheritedPointsValue)}
              registerProps={register(originalPointsProperty, {
                setValueAs: coerceToNumber,
                validate: pointsValidation,
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
              onReset={() =>
                setValue(originalPointsProperty, undefined, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          ) : (
            <div className="mb-3">
              <label htmlFor="question-autoPoints" className="form-label">
                Auto points
              </label>
              <input
                type="number"
                className={clsx(
                  'form-control form-control-sm',
                  errors[originalPointsProperty] && 'is-invalid',
                )}
                id="question-autoPoints"
                step="any"
                {...register(originalPointsProperty, {
                  setValueAs: coerceToNumber,
                  validate: pointsValidation,
                })}
              />
              {errors[originalPointsProperty] && (
                <div className="invalid-feedback">{errors[originalPointsProperty].message}</div>
              )}
              <small className="form-text text-muted">
                Points awarded for the auto-graded component.
              </small>
            </div>
          )}
          {isAlternative ? (
            <InheritableField
              id="question-maxAutoPoints"
              label="Max auto points"
              inputType="number"
              isInherited={isMaxInherited}
              inheritedDisplayValue={String(inheritedMaxValue ?? '')}
              registerProps={register(originalMaxProperty, {
                setValueAs: coerceToNumber,
              })}
              error={errors[originalMaxProperty]}
              helpText="Maximum total auto-graded points achievable across all attempts."
              inheritedValueLabel={String(inheritedMaxValue ?? '')}
              showResetButton={inheritedMaxValue != null}
              onOverride={() =>
                setValue(originalMaxProperty, inheritedMaxValue, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              onReset={() =>
                setValue(originalMaxProperty, undefined, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          ) : (
            <div className="mb-3">
              <label htmlFor="question-maxAutoPoints" className="form-label">
                Max auto points
              </label>
              <input
                type="number"
                className="form-control form-control-sm"
                id="question-maxAutoPoints"
                {...register(originalMaxProperty, {
                  setValueAs: coerceToNumber,
                })}
              />
              <small className="form-text text-muted">
                Maximum total auto-graded points achievable across all attempts.
              </small>
            </div>
          )}
          {isAlternative ? (
            <InheritableField
              id="question-manualPoints"
              label="Manual points"
              inputType="number"
              isInherited={isManualPointsInherited}
              inheritedDisplayValue={String(inheritedManualPoints ?? '')}
              registerProps={register('manualPoints', {
                setValueAs: coerceToNumber,
                validate: pointsValidation,
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
              onReset={() =>
                setValue('manualPoints', undefined, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          ) : (
            <div className="mb-3">
              <label htmlFor="question-manualPoints" className="form-label">
                Manual points
              </label>
              <input
                type="number"
                className={clsx(
                  'form-control form-control-sm',
                  errors.manualPoints && 'is-invalid',
                )}
                id="question-manualPoints"
                {...register('manualPoints', {
                  setValueAs: coerceToNumber,
                  validate: pointsValidation,
                })}
              />
              {errors.manualPoints && (
                <div className="invalid-feedback">{errors.manualPoints.message}</div>
              )}
              <small className="form-text text-muted">
                Points awarded for the manually graded component.
              </small>
            </div>
          )}
          <div className="mb-3">
            <label htmlFor="question-triesPerVariant" className="form-label">
              Tries per variant
            </label>
            <input
              type="number"
              className={clsx(
                'form-control form-control-sm',
                errors.triesPerVariant && 'is-invalid',
              )}
              id="question-triesPerVariant"
              {...register('triesPerVariant', {
                setValueAs: coerceToNumber,
                validate: (v) => validatePositiveInteger(v, 'Tries per variant'),
              })}
            />
            {errors.triesPerVariant && (
              <div className="invalid-feedback">{errors.triesPerVariant.message}</div>
            )}
            <small className="form-text text-muted">
              Number of submission attempts allowed per question variant.
            </small>
          </div>
        </>
      ) : (
        <>
          {isAlternative ? (
            <InheritableField
              id="question-pointsList"
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
                validate: pointsValidation,
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
              onReset={() =>
                setValue(originalPointsProperty, undefined, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          ) : (
            <div className="mb-3">
              <label htmlFor="question-pointsList" className="form-label">
                Points list
              </label>
              <input
                type="text"
                className={clsx(
                  'form-control form-control-sm',
                  errors[originalPointsProperty] && 'is-invalid',
                )}
                id="question-pointsList"
                {...register(originalPointsProperty, {
                  pattern: {
                    value: /^[0-9, ]*$/,
                    message: 'Points must be a number or a comma-separated list of numbers.',
                  },
                  setValueAs: parsePointsListValue,
                  validate: pointsValidation,
                })}
              />
              {errors[originalPointsProperty] && (
                <div className="invalid-feedback">{errors[originalPointsProperty].message}</div>
              )}
              <small className="form-text text-muted">
                Points for each attempt, as a comma-separated list (e.g. "10, 5, 2, 1").
              </small>
            </div>
          )}
          {isAlternative ? (
            <InheritableField
              id="question-manualPoints"
              label="Manual points"
              inputType="number"
              isInherited={isManualPointsInherited}
              inheritedDisplayValue={String(inheritedManualPoints ?? '')}
              registerProps={register('manualPoints', {
                setValueAs: coerceToNumber,
                validate: pointsValidation,
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
              onReset={() =>
                setValue('manualPoints', undefined, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          ) : (
            <div className="mb-3">
              <label htmlFor="question-manualPoints" className="form-label">
                Manual points
              </label>
              <input
                type="number"
                className={clsx(
                  'form-control form-control-sm',
                  errors.manualPoints && 'is-invalid',
                )}
                id="question-manualPoints"
                {...register('manualPoints', {
                  setValueAs: coerceToNumber,
                  validate: pointsValidation,
                })}
              />
              {errors.manualPoints && (
                <div className="invalid-feedback">{errors.manualPoints.message}</div>
              )}
              <small className="form-text text-muted">
                Points awarded for the manually graded component.
              </small>
            </div>
          )}
        </>
      )}

      <div className="mb-3">
        <label htmlFor="question-comment" className="form-label">
          Comment
        </label>
        <textarea
          className="form-control form-control-sm"
          id="question-comment"
          rows={2}
          {...register('comment')}
        />
        <small className="form-text text-muted">Internal note, not shown to students.</small>
      </div>

      <AdvancedFields register={register} idPrefix="question" variant="question" />

      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={() => onDelete(questionTrackingId, question.id ?? '', alternativeTrackingId)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
