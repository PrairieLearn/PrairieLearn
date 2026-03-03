import clsx from 'clsx';
import { useForm } from 'react-hook-form';

import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { ZoneQuestionBlockForm } from '../../types.js';
import {
  coerceToNumber,
  extractStringComment,
  parsePointsListValue,
} from '../../utils/formHelpers.js';
import { validatePositiveInteger } from '../../utils/questions.js';

import { AdvancedFields } from './AdvancedFields.js';

interface AltGroupFormData {
  numberChoose?: number;
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

export function AltGroupDetailPanel({
  zoneQuestionBlock,
  editMode,
  assessmentType,
  onUpdate,
  onDelete,
}: {
  zoneQuestionBlock: ZoneQuestionBlockForm;
  editMode: boolean;
  assessmentType: EnumAssessmentType;
  onUpdate: (questionTrackingId: string, question: Partial<ZoneQuestionBlockForm>) => void;
  onDelete: (questionTrackingId: string, questionId: string) => void;
}) {
  const alternativeCount = zoneQuestionBlock.alternatives?.length ?? 0;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AltGroupFormData>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    values: {
      numberChoose: zoneQuestionBlock.numberChoose ?? undefined,
      comment: extractStringComment(zoneQuestionBlock.comment),
      points: zoneQuestionBlock.points ?? undefined,
      autoPoints: zoneQuestionBlock.autoPoints ?? undefined,
      maxPoints: zoneQuestionBlock.maxPoints ?? undefined,
      maxAutoPoints: zoneQuestionBlock.maxAutoPoints ?? undefined,
      manualPoints: zoneQuestionBlock.manualPoints ?? undefined,
      triesPerVariant: zoneQuestionBlock.triesPerVariant ?? undefined,
      advanceScorePerc: zoneQuestionBlock.advanceScorePerc ?? undefined,
      gradeRateMinutes: zoneQuestionBlock.gradeRateMinutes ?? undefined,
      forceMaxPoints: zoneQuestionBlock.forceMaxPoints ?? undefined,
      allowRealTimeGrading: zoneQuestionBlock.allowRealTimeGrading ?? undefined,
    },
  });

  const onSubmit = (data: AltGroupFormData) => {
    onUpdate(zoneQuestionBlock.trackingId, data);
  };

  if (!editMode) {
    return (
      <div className="p-3">
        <h6 className="text-muted text-uppercase small mb-3">Alternative group properties</h6>
        <dl className="mb-0">
          <dt>Alternatives</dt>
          <dd>{alternativeCount}</dd>
          <dt>Number to choose</dt>
          <dd>{zoneQuestionBlock.numberChoose ?? `All (${alternativeCount})`}</dd>
          {zoneQuestionBlock.points != null && (
            <>
              <dt>{assessmentType === 'Exam' ? 'Points' : 'Auto points'}</dt>
              <dd>
                {Array.isArray(zoneQuestionBlock.points)
                  ? zoneQuestionBlock.points.join(', ')
                  : zoneQuestionBlock.points}
              </dd>
            </>
          )}
          {zoneQuestionBlock.autoPoints != null && (
            <>
              <dt>Auto points</dt>
              <dd>
                {Array.isArray(zoneQuestionBlock.autoPoints)
                  ? zoneQuestionBlock.autoPoints.join(', ')
                  : zoneQuestionBlock.autoPoints}
              </dd>
            </>
          )}
          {zoneQuestionBlock.manualPoints != null && (
            <>
              <dt>Manual points</dt>
              <dd>{zoneQuestionBlock.manualPoints}</dd>
            </>
          )}
          {zoneQuestionBlock.comment != null && (
            <>
              <dt>Comment</dt>
              <dd className="text-break">{String(zoneQuestionBlock.comment)}</dd>
            </>
          )}
        </dl>
      </div>
    );
  }

  return (
    <form className="p-3" onSubmit={handleSubmit(onSubmit)}>
      <h6 className="text-muted text-uppercase small mb-3">Edit alternative group</h6>

      <div className="mb-3">
        <label htmlFor="altgroup-numberChoose" className="form-label">
          Number to choose
        </label>
        <input
          type="number"
          className={clsx('form-control form-control-sm', errors.numberChoose && 'is-invalid')}
          id="altgroup-numberChoose"
          {...register('numberChoose', {
            setValueAs: coerceToNumber,
            validate: (v) => validatePositiveInteger(v, 'Number to choose'),
          })}
        />
        {errors.numberChoose && (
          <div className="invalid-feedback">{errors.numberChoose.message}</div>
        )}
        <small className="form-text text-muted">
          How many of the {alternativeCount} alternatives to choose (leave empty for all).
        </small>
      </div>

      {assessmentType === 'Homework' ? (
        <>
          <div className="mb-3">
            <label htmlFor="altgroup-autoPoints" className="form-label">
              Auto points (shared)
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="altgroup-autoPoints"
              step="any"
              {...register('autoPoints', {
                setValueAs: coerceToNumber,
              })}
            />
            <small className="form-text text-muted">
              Default auto points inherited by alternatives unless overridden.
            </small>
          </div>
          <div className="mb-3">
            <label htmlFor="altgroup-maxAutoPoints" className="form-label">
              Max auto points (shared)
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="altgroup-maxAutoPoints"
              {...register('maxAutoPoints', {
                setValueAs: coerceToNumber,
              })}
            />
            <small className="form-text text-muted">
              Default max auto points inherited by alternatives unless overridden.
            </small>
          </div>
          <div className="mb-3">
            <label htmlFor="altgroup-manualPoints" className="form-label">
              Manual points (shared)
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="altgroup-manualPoints"
              {...register('manualPoints', {
                setValueAs: coerceToNumber,
              })}
            />
            <small className="form-text text-muted">
              Default manual points inherited by alternatives unless overridden.
            </small>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3">
            <label htmlFor="altgroup-points" className="form-label">
              Points list (shared)
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              id="altgroup-points"
              {...register('points', {
                setValueAs: parsePointsListValue,
              })}
            />
            <small className="form-text text-muted">
              Default points list inherited by alternatives unless overridden.
            </small>
          </div>
          <div className="mb-3">
            <label htmlFor="altgroup-manualPoints" className="form-label">
              Manual points (shared)
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="altgroup-manualPoints"
              {...register('manualPoints', {
                setValueAs: coerceToNumber,
              })}
            />
            <small className="form-text text-muted">
              Default manual points inherited by alternatives unless overridden.
            </small>
          </div>
        </>
      )}

      <div className="mb-3">
        <label htmlFor="altgroup-comment" className="form-label">
          Comment
        </label>
        <textarea
          className="form-control form-control-sm"
          id="altgroup-comment"
          rows={2}
          {...register('comment')}
        />
        <small className="form-text text-muted">Internal note, not shown to students.</small>
      </div>

      <AdvancedFields register={register} idPrefix="altgroup" variant="altGroup" />

      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-sm btn-primary" disabled={!isDirty}>
          Apply
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={() => onDelete(zoneQuestionBlock.trackingId, '')}
        >
          Delete alternative group
        </button>
      </div>
    </form>
  );
}
