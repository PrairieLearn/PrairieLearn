import clsx from 'clsx';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import type { ZoneAssessmentForm } from '../../types.js';
import { validatePositiveInteger } from '../../utils/questions.js';

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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const formValues: ZoneFormData = {
    title: zone.title ?? '',
    maxPoints: zone.maxPoints ?? undefined,
    numberChoose: zone.numberChoose ?? undefined,
    bestQuestions: zone.bestQuestions ?? undefined,
    lockpoint: zone.lockpoint ?? false,
    comment: typeof zone.comment === 'string' ? zone.comment : undefined,
    advanceScorePerc: zone.advanceScorePerc ?? undefined,
    gradeRateMinutes: zone.gradeRateMinutes ?? undefined,
    allowRealTimeGrading: zone.allowRealTimeGrading ?? undefined,
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ZoneFormData>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    values: formValues,
  });

  const onSubmit = (data: ZoneFormData) => {
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
  };

  if (!editMode) {
    return (
      <div className="p-3">
        <h6 className="text-muted text-uppercase small mb-3">Zone properties</h6>
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
    <form className="p-3" onSubmit={handleSubmit(onSubmit)}>
      <h6 className="text-muted text-uppercase small mb-3">Edit zone</h6>

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
            setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
          })}
        />
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
            setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
            validate: (v) => validatePositiveInteger(v, 'Number to choose'),
          })}
        />
        {errors.numberChoose && (
          <div className="invalid-feedback">{errors.numberChoose.message}</div>
        )}
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
            setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
            validate: (v) => validatePositiveInteger(v, 'Best questions'),
          })}
        />
        {errors.bestQuestions && (
          <div className="invalid-feedback">{errors.bestQuestions.message}</div>
        )}
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
            <label htmlFor="zone-advanceScorePerc" className="form-label">
              Advance score %
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="zone-advanceScorePerc"
              {...register('advanceScorePerc', {
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
              })}
            />
          </div>
          <div className="mb-3">
            <label htmlFor="zone-gradeRateMinutes" className="form-label">
              Grade rate (minutes)
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="zone-gradeRateMinutes"
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
              id="zone-allowRealTimeGrading"
              {...register('allowRealTimeGrading')}
            />
            <label htmlFor="zone-allowRealTimeGrading" className="form-check-label">
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
          onClick={() => onDelete(zone.trackingId)}
        >
          Delete zone
        </button>
      </div>
    </form>
  );
}
