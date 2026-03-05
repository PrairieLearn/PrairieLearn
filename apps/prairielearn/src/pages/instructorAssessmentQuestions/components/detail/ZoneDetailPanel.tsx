import clsx from 'clsx';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import type { ZoneAssessmentForm } from '../../types.js';
import {
  type AssessmentAdvancedDefaults,
  coerceToNumber,
  extractStringComment,
} from '../../utils/formHelpers.js';
import { validatePositiveInteger } from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';

import { AdvancedFields, type AdvancedFieldsInheritance } from './AdvancedFields.js';

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
  editMode,
  assessmentDefaults,
  onUpdate,
  onDelete,
}: {
  zone: ZoneAssessmentForm;
  zoneIndex: number;
  idPrefix: string;
  editMode: boolean;
  assessmentDefaults: AssessmentAdvancedDefaults;
  onUpdate: (zoneTrackingId: string, zone: Partial<ZoneAssessmentForm>) => void;
  onDelete: (zoneTrackingId: string) => void;
}) {
  const formValues: ZoneFormData = {
    title: zone.title ?? '',
    maxPoints: zone.maxPoints ?? undefined,
    numberChoose: zone.numberChoose ?? undefined,
    bestQuestions: zone.bestQuestions ?? undefined,
    lockpoint: zone.lockpoint,
    comment: extractStringComment(zone.comment),
    advanceScorePerc: zone.advanceScorePerc ?? undefined,
    gradeRateMinutes: zone.gradeRateMinutes ?? undefined,
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

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave });

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
    getValues,
    onSave: handleSave,
  };

  if (!editMode) {
    const effectiveAdvanceScorePerc = zone.advanceScorePerc ?? assessmentDefaults.advanceScorePerc;
    const effectiveGradeRateMinutes = zone.gradeRateMinutes ?? assessmentDefaults.gradeRateMinutes;
    const effectiveAllowRealTimeGrading =
      zone.allowRealTimeGrading ?? assessmentDefaults.allowRealTimeGrading;

    return (
      <div className="p-3">
        <dl className="mb-0">
          <dt>Title</dt>
          <dd>{zone.title || <span className="text-muted">No title</span>}</dd>
          {zone.maxPoints != null && (
            <>
              <dt>Max points</dt>
              <dd>{zone.maxPoints}</dd>
            </>
          )}
          {zone.numberChoose != null && (
            <>
              <dt>Number to choose</dt>
              <dd>{zone.numberChoose}</dd>
            </>
          )}
          {zone.bestQuestions != null && (
            <>
              <dt>Best questions</dt>
              <dd>{zone.bestQuestions}</dd>
            </>
          )}
          {zone.lockpoint && (
            <>
              <dt>Lockpoint</dt>
              <dd>Yes</dd>
            </>
          )}
          {zone.comment != null && (
            <>
              <dt>Comment</dt>
              <dd className="text-break">{String(zone.comment)}</dd>
            </>
          )}
          {effectiveAdvanceScorePerc != null && (
            <>
              <dt>Advance score %</dt>
              <dd>
                {effectiveAdvanceScorePerc}%
                {zone.advanceScorePerc == null && (
                  <span className="text-muted"> (inherited from assessment)</span>
                )}
              </dd>
            </>
          )}
          {effectiveGradeRateMinutes != null && (
            <>
              <dt>Grade rate (minutes)</dt>
              <dd>
                {effectiveGradeRateMinutes}
                {zone.gradeRateMinutes == null && (
                  <span className="text-muted"> (inherited from assessment)</span>
                )}
              </dd>
            </>
          )}
          {effectiveAllowRealTimeGrading != null && (
            <>
              <dt>Allow real-time grading</dt>
              <dd>
                {effectiveAllowRealTimeGrading ? 'Yes' : 'No'}
                {zone.allowRealTimeGrading == null && (
                  <span className="text-muted"> (inherited from assessment)</span>
                )}
              </dd>
            </>
          )}
        </dl>
        <div className="mt-2 text-muted small">
          {zone.questions.length} question{zone.questions.length !== 1 ? 's' : ''} in zone
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="mb-3">
        <label htmlFor={`${idPrefix}-title`} className="form-label">
          Title
        </label>
        <input
          type="text"
          className="form-control form-control-sm"
          id={`${idPrefix}-title`}
          aria-describedby={`${idPrefix}-title-help`}
          {...register('title')}
        />
        <small id={`${idPrefix}-title-help`} className="form-text text-muted">
          Display name shown to students.
        </small>
      </div>

      <div className="mb-3">
        <label htmlFor={`${idPrefix}-maxPoints`} className="form-label">
          Max points
        </label>
        <input
          type="number"
          className={clsx('form-control form-control-sm', errors.maxPoints && 'is-invalid')}
          id={`${idPrefix}-maxPoints`}
          aria-invalid={!!errors.maxPoints}
          aria-errormessage={errors.maxPoints ? `${idPrefix}-maxPoints-error` : undefined}
          aria-describedby={`${idPrefix}-maxPoints-help`}
          {...register('maxPoints', {
            setValueAs: coerceToNumber,
            validate: (v) => {
              if (v != null && v < 0) return 'Max points must be non-negative.';
            },
          })}
        />
        {errors.maxPoints && (
          <div id={`${idPrefix}-maxPoints-error`} className="invalid-feedback">
            {errors.maxPoints.message}
          </div>
        )}
        <small id={`${idPrefix}-maxPoints-help`} className="form-text text-muted">
          Maximum total points from this zone that count toward the assessment.
        </small>
      </div>

      <div className="mb-3">
        <label htmlFor={`${idPrefix}-numberChoose`} className="form-label">
          Number to choose
        </label>
        <input
          type="number"
          className={clsx('form-control form-control-sm', errors.numberChoose && 'is-invalid')}
          id={`${idPrefix}-numberChoose`}
          aria-invalid={!!errors.numberChoose}
          aria-errormessage={errors.numberChoose ? `${idPrefix}-numberChoose-error` : undefined}
          aria-describedby={`${idPrefix}-numberChoose-help`}
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
        {errors.numberChoose && (
          <div id={`${idPrefix}-numberChoose-error`} className="invalid-feedback">
            {errors.numberChoose.message}
          </div>
        )}
        <small id={`${idPrefix}-numberChoose-help`} className="form-text text-muted">
          How many questions from this zone to present (leave empty for all).
        </small>
      </div>

      <div className="mb-3">
        <label htmlFor={`${idPrefix}-bestQuestions`} className="form-label">
          Best questions
        </label>
        <input
          type="number"
          className={clsx('form-control form-control-sm', errors.bestQuestions && 'is-invalid')}
          id={`${idPrefix}-bestQuestions`}
          aria-invalid={!!errors.bestQuestions}
          aria-errormessage={errors.bestQuestions ? `${idPrefix}-bestQuestions-error` : undefined}
          aria-describedby={`${idPrefix}-bestQuestions-help`}
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
        {errors.bestQuestions && (
          <div id={`${idPrefix}-bestQuestions-error`} className="invalid-feedback">
            {errors.bestQuestions.message}
          </div>
        )}
        <small id={`${idPrefix}-bestQuestions-help`} className="form-text text-muted">
          Only the N highest-scoring questions in this zone count toward the total (leave empty for
          all).
        </small>
      </div>

      <div className="mb-3 form-check">
        <input
          type="checkbox"
          className={clsx('form-check-input', errors.lockpoint && 'is-invalid')}
          id={`${idPrefix}-lockpoint`}
          aria-invalid={!!errors.lockpoint}
          aria-errormessage={errors.lockpoint ? `${idPrefix}-lockpoint-error` : undefined}
          aria-describedby={`${idPrefix}-lockpoint-help`}
          {...register('lockpoint', {
            validate: (v) => {
              if (v && zoneIndex === 0) {
                return 'The first zone cannot have lockpoint enabled.';
              }
            },
          })}
        />
        <label htmlFor={`${idPrefix}-lockpoint`} className="form-check-label">
          Lockpoint
        </label>
        {errors.lockpoint && (
          <div id={`${idPrefix}-lockpoint-error`} className="invalid-feedback">
            {errors.lockpoint.message}
          </div>
        )}
        <small id={`${idPrefix}-lockpoint-help`} className="form-text text-muted d-block">
          Creates a one-way barrier; crossing it makes all earlier zones read-only.
        </small>
      </div>

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
        variant="zone"
        inheritance={advancedInheritance}
      />

      <div className="mt-2 mb-3 text-muted small">
        {zone.questions.length} question{zone.questions.length !== 1 ? 's' : ''} in zone
      </div>

      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => onDelete(zone.trackingId)}
      >
        Delete zone
      </button>
    </div>
  );
}
