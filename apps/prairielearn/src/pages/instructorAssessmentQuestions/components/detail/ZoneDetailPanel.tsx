import clsx from 'clsx';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import type { ZoneAssessmentForm } from '../../types.js';
import { coerceToNumber, extractStringComment } from '../../utils/formHelpers.js';
import { validatePositiveInteger } from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';

import { AdvancedFields } from './AdvancedFields.js';

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
  editMode,
  onUpdate,
  onDelete,
}: {
  zone: ZoneAssessmentForm;
  editMode: boolean;
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

  if (!editMode) {
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
          {/* TODO: Display inherited values from assessment-level settings */}
          {zone.advanceScorePerc != null && (
            <>
              <dt>Advance score %</dt>
              <dd>{zone.advanceScorePerc}%</dd>
            </>
          )}
          {zone.gradeRateMinutes != null && (
            <>
              <dt>Grade rate (minutes)</dt>
              <dd>{zone.gradeRateMinutes}</dd>
            </>
          )}
          {zone.allowRealTimeGrading != null && (
            <>
              <dt>Allow real-time grading</dt>
              <dd>{zone.allowRealTimeGrading ? 'Yes' : 'No'}</dd>
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
        <label htmlFor="zone-title" className="form-label">
          Title
        </label>
        <input
          type="text"
          className="form-control form-control-sm"
          id="zone-title"
          {...register('title')}
        />
        <small className="form-text text-muted">Display name shown to students.</small>
      </div>

      <div className="mb-3">
        <label htmlFor="zone-maxPoints" className="form-label">
          Max points
        </label>
        <input
          type="number"
          className="form-control form-control-sm"
          id="zone-maxPoints"
          {...register('maxPoints', {
            setValueAs: coerceToNumber,
          })}
        />
        <small className="form-text text-muted">
          Maximum total points from this zone that count toward the assessment.
        </small>
      </div>

      <div className="mb-3">
        <label htmlFor="zone-numberChoose" className="form-label">
          Number to choose
        </label>
        <input
          type="number"
          className={clsx('form-control form-control-sm', errors.numberChoose && 'is-invalid')}
          id="zone-numberChoose"
          {...register('numberChoose', {
            setValueAs: coerceToNumber,
            validate: (v) => validatePositiveInteger(v, 'Number to choose'),
          })}
        />
        {errors.numberChoose && (
          <div className="invalid-feedback">{errors.numberChoose.message}</div>
        )}
        <small className="form-text text-muted">
          How many questions from this zone to present (leave empty for all).
        </small>
      </div>

      <div className="mb-3">
        <label htmlFor="zone-bestQuestions" className="form-label">
          Best questions
        </label>
        <input
          type="number"
          className={clsx('form-control form-control-sm', errors.bestQuestions && 'is-invalid')}
          id="zone-bestQuestions"
          {...register('bestQuestions', {
            setValueAs: coerceToNumber,
            validate: (v) => validatePositiveInteger(v, 'Best questions'),
          })}
        />
        {errors.bestQuestions && (
          <div className="invalid-feedback">{errors.bestQuestions.message}</div>
        )}
        <small className="form-text text-muted">
          Only the N highest-scoring questions in this zone count toward the total (leave empty for
          all).
        </small>
      </div>

      <div className="mb-3 form-check">
        <input
          type="checkbox"
          className="form-check-input"
          id="zone-lockpoint"
          {...register('lockpoint')}
        />
        <label htmlFor="zone-lockpoint" className="form-check-label">
          Lockpoint
        </label>
        <small className="form-text text-muted d-block">
          Creates a one-way barrier; crossing it makes all earlier zones read-only.
        </small>
      </div>

      <div className="mb-3">
        <label htmlFor="zone-comment" className="form-label">
          Comment
        </label>
        <textarea
          className="form-control form-control-sm"
          id="zone-comment"
          rows={2}
          {...register('comment')}
        />
        <small className="form-text text-muted">Internal note, not shown to students.</small>
      </div>

      <AdvancedFields register={register} idPrefix="zone" variant="zone" />

      <div className="mt-2 mb-3 text-muted small">
        {zone.questions.length} question{zone.questions.length !== 1 ? 's' : ''} in zone
      </div>

      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={() => onDelete(zone.trackingId)}
        >
          Delete zone
        </button>
      </div>
    </div>
  );
}
