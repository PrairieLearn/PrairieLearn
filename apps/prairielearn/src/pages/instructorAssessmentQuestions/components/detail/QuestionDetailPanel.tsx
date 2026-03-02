import clsx from 'clsx';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { TagBadgeList } from '../../../../components/TagBadge.js';
import { TopicBadge } from '../../../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { QuestionAlternativeForm, SelectedItem, ZoneQuestionBlockForm } from '../../types.js';
import { validatePositiveInteger } from '../../utils/questions.js';

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
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const autoPointsValue =
    question[originalPointsProperty] ?? zoneQuestionBlock?.[originalPointsProperty];
  const maxAutoPointsValue =
    question[originalMaxProperty] ?? zoneQuestionBlock?.[originalMaxProperty];
  const manualPointsValue = question.manualPoints ?? zoneQuestionBlock?.manualPoints;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<QuestionFormData>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    values: {
      id: question.id ?? undefined,
      comment: typeof question.comment === 'string' ? question.comment : undefined,
      [originalPointsProperty]: autoPointsValue ?? undefined,
      [originalMaxProperty]: maxAutoPointsValue ?? undefined,
      manualPoints: manualPointsValue ?? undefined,
      triesPerVariant: question.triesPerVariant ?? undefined,
      advanceScorePerc: question.advanceScorePerc ?? undefined,
      gradeRateMinutes: question.gradeRateMinutes ?? undefined,
      forceMaxPoints: question.forceMaxPoints ?? undefined,
      allowRealTimeGrading: question.allowRealTimeGrading ?? undefined,
    },
  });

  const questionTrackingId = isAlternative ? zoneQuestionBlock.trackingId : question.trackingId;
  const alternativeTrackingId = isAlternative ? question.trackingId : undefined;

  const onSubmit = (data: QuestionFormData) => {
    onUpdate(questionTrackingId, data, alternativeTrackingId);
  };

  if (!editMode) {
    return (
      <div className="p-3">
        <h6 className="text-muted text-uppercase small mb-3">Question properties</h6>
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
            <code className="text-muted small">{question.id}</code>
            <div className="d-flex flex-wrap gap-1 mt-2">
              <TopicBadge topic={questionData.topic} />
              <TagBadgeList tags={questionData.tags} />
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

  return (
    <form className="p-3" onSubmit={handleSubmit(onSubmit)}>
      <h6 className="text-muted text-uppercase small mb-3">
        {isAlternative ? 'Edit alternative' : 'Edit question'}
      </h6>

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
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                validate: (_value, { manualPoints }) => {
                  if (manualPoints === undefined && _value === undefined) {
                    return 'At least one of auto points or manual points must be set.';
                  }
                },
              })}
            />
            {errors[originalPointsProperty] && (
              <div className="invalid-feedback">{errors[originalPointsProperty]?.message}</div>
            )}
          </div>
          <div className="mb-3">
            <label htmlFor="question-maxAutoPoints" className="form-label">
              Max auto points
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="question-maxAutoPoints"
              {...register(originalMaxProperty, {
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
              })}
            />
          </div>
          <div className="mb-3">
            <label htmlFor="question-manualPoints" className="form-label">
              Manual points
            </label>
            <input
              type="number"
              className={clsx('form-control form-control-sm', errors.manualPoints && 'is-invalid')}
              id="question-manualPoints"
              {...register('manualPoints', {
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                validate: (value, { autoPoints, points }) => {
                  if (points === undefined && autoPoints === undefined && value === undefined) {
                    return 'At least one of auto points or manual points must be set.';
                  }
                },
              })}
            />
            {errors.manualPoints && (
              <div className="invalid-feedback">{errors.manualPoints.message}</div>
            )}
          </div>
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
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                validate: (v) => validatePositiveInteger(v, 'Tries per variant'),
              })}
            />
            {errors.triesPerVariant && (
              <div className="invalid-feedback">{errors.triesPerVariant.message}</div>
            )}
          </div>
        </>
      ) : (
        <>
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
                setValueAs: (v: string) => {
                  if (v === '') return undefined;
                  if (!Number.isNaN(Number(v))) return Number(v);
                  if (v.includes(',')) {
                    return v
                      .split(',')
                      .map((s: string) => Number(s.trim()))
                      .filter((n: number) => !Number.isNaN(n));
                  }
                  return v;
                },
                validate: (_value, { manualPoints }) => {
                  if (_value === undefined && manualPoints === undefined) {
                    return 'At least one of points or manual points must be set.';
                  }
                },
              })}
            />
            {errors[originalPointsProperty] && (
              <div className="invalid-feedback">{errors[originalPointsProperty]?.message}</div>
            )}
          </div>
          <div className="mb-3">
            <label htmlFor="question-manualPoints" className="form-label">
              Manual points
            </label>
            <input
              type="number"
              className={clsx('form-control form-control-sm', errors.manualPoints && 'is-invalid')}
              id="question-manualPoints"
              {...register('manualPoints', {
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                validate: (value, { autoPoints, points }) => {
                  if (points === undefined && autoPoints === undefined && value === undefined) {
                    return 'At least one of points or manual points must be set.';
                  }
                },
              })}
            />
            {errors.manualPoints && (
              <div className="invalid-feedback">{errors.manualPoints.message}</div>
            )}
          </div>
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
      </div>

      <button
        type="button"
        className="btn btn-sm btn-link p-0 mb-2"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <i className={`fa fa-chevron-${showAdvanced ? 'down' : 'right'} me-1`} aria-hidden="true" />
        Advanced
      </button>

      {showAdvanced && (
        <>
          <div className="mb-3">
            <label htmlFor="question-advanceScorePerc" className="form-label">
              Advance score %
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="question-advanceScorePerc"
              {...register('advanceScorePerc', {
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
              })}
            />
          </div>
          <div className="mb-3">
            <label htmlFor="question-gradeRateMinutes" className="form-label">
              Grade rate (minutes)
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="question-gradeRateMinutes"
              step="any"
              {...register('gradeRateMinutes', {
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
              })}
            />
          </div>
          <div className="mb-3 form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="question-forceMaxPoints"
              {...register('forceMaxPoints')}
            />
            <label htmlFor="question-forceMaxPoints" className="form-check-label">
              Force max points
            </label>
          </div>
          <div className="mb-3 form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="question-allowRealTimeGrading"
              {...register('allowRealTimeGrading')}
            />
            <label htmlFor="question-allowRealTimeGrading" className="form-check-label">
              Allow real-time grading
            </label>
          </div>
        </>
      )}

      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-sm btn-primary" disabled={!isDirty}>
          Apply
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={() => onDelete(questionTrackingId, question.id ?? '', alternativeTrackingId)}
        >
          Delete
        </button>
      </div>
    </form>
  );
}
