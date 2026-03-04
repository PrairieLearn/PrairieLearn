import clsx from 'clsx';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { ZoneAssessmentForm, ZoneQuestionBlockForm } from '../../types.js';
import {
  coerceToNumber,
  extractStringComment,
  parsePointsListValue,
  resolveMaxPointsProperty,
  resolvePointsProperty,
  validateNonIncreasingPoints,
} from '../../utils/formHelpers.js';
import { validatePositiveInteger } from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';

import type { AdvancedFieldsInheritance } from './AdvancedFields.js';
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
  zone,
  idPrefix,
  editMode,
  assessmentType,
  onUpdate,
  onDelete,
  onAddAlternative,
}: {
  zoneQuestionBlock: ZoneQuestionBlockForm;
  zone: ZoneAssessmentForm;
  idPrefix: string;
  editMode: boolean;
  assessmentType: EnumAssessmentType;
  onUpdate: (questionTrackingId: string, question: Partial<ZoneQuestionBlockForm>) => void;
  onDelete: (questionTrackingId: string, questionId: string) => void;
  onAddAlternative: (altGroupTrackingId: string) => void;
}) {
  const alternativeCount = zoneQuestionBlock.alternatives?.length ?? 0;

  const originalPointsProperty = resolvePointsProperty(zoneQuestionBlock);
  const originalMaxProperty = resolveMaxPointsProperty(originalPointsProperty, zoneQuestionBlock);

  const {
    register,
    getValues,
    watch,
    setValue,
    formState: { errors, isDirty, isValid },
  } = useForm<AltGroupFormData>({
    mode: 'onChange',
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

  const handleSave = useCallback(
    (data: AltGroupFormData) => onUpdate(zoneQuestionBlock.trackingId, data),
    [onUpdate, zoneQuestionBlock.trackingId],
  );

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave });

  const advancedInheritance: AdvancedFieldsInheritance | undefined =
    zone.advanceScorePerc != null ||
    zone.gradeRateMinutes != null ||
    zone.allowRealTimeGrading != null
      ? {
          parentAdvanceScorePerc: zone.advanceScorePerc,
          parentGradeRateMinutes: zone.gradeRateMinutes,
          parentAllowRealTimeGrading: zone.allowRealTimeGrading,
          parentForceMaxPoints: undefined,
          inheritedFromLabel: 'zone',
          watch,
          setValue,
          getValues,
          onSave: handleSave,
        }
      : undefined;

  const watchedAutoPoints = watch(originalPointsProperty);
  const autoPointsPlaceholder =
    watchedAutoPoints == null
      ? ''
      : String(Array.isArray(watchedAutoPoints) ? watchedAutoPoints[0] : watchedAutoPoints);

  if (!editMode) {
    return (
      <div className="p-3">
        <dl className="mb-0">
          <dt>Alternatives</dt>
          <dd>{alternativeCount}</dd>
          <dt>Number to choose</dt>
          <dd>{zoneQuestionBlock.numberChoose ?? 1}</dd>
          {zoneQuestionBlock[originalPointsProperty] != null && (
            <>
              <dt>{assessmentType === 'Exam' ? 'Points' : 'Auto points'}</dt>
              <dd>
                {Array.isArray(zoneQuestionBlock[originalPointsProperty])
                  ? zoneQuestionBlock[originalPointsProperty].join(', ')
                  : zoneQuestionBlock[originalPointsProperty]}
              </dd>
            </>
          )}
          {zoneQuestionBlock[originalMaxProperty] != null && (
            <>
              <dt>Max auto points</dt>
              <dd>{zoneQuestionBlock[originalMaxProperty]}</dd>
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
    <div className="p-3">
      <div className="mb-3 text-muted small">
        {alternativeCount} alternative{alternativeCount !== 1 ? 's' : ''} in group
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
              if (v != null && v > alternativeCount) {
                return `Cannot exceed number of alternatives (${alternativeCount}).`;
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
          How many of the {alternativeCount} alternatives to randomly choose for each student
          (default: 1).
        </small>
      </div>

      {assessmentType === 'Homework' ? (
        <>
          <div className="mb-3">
            <label htmlFor={`${idPrefix}-autoPoints`} className="form-label">
              Auto points (default)
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
                validate: (v) => {
                  if (typeof v === 'number' && v < 0) return 'Auto points must be non-negative.';
                },
              })}
            />
            {errors[originalPointsProperty] && (
              <div id={`${idPrefix}-autoPoints-error`} className="invalid-feedback">
                {errors[originalPointsProperty].message!}
              </div>
            )}
            <small id={`${idPrefix}-autoPoints-help`} className="form-text text-muted">
              Default auto points inherited by alternatives unless overridden.
            </small>
          </div>
          <div className="mb-3">
            <label htmlFor={`${idPrefix}-maxAutoPoints`} className="form-label">
              Max auto points (default)
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
                validate: (v) => {
                  if (v != null && v < 0) return 'Max auto points must be non-negative.';
                },
              })}
            />
            {errors[originalMaxProperty] && (
              <div id={`${idPrefix}-maxAutoPoints-error`} className="invalid-feedback">
                {errors[originalMaxProperty].message!}
              </div>
            )}
            <small id={`${idPrefix}-maxAutoPoints-help`} className="form-text text-muted">
              Default max auto points inherited by alternatives unless overridden. Defaults to auto
              points if not set.
            </small>
          </div>
          <div className="mb-3">
            <label htmlFor={`${idPrefix}-manualPoints`} className="form-label">
              Manual points (default)
            </label>
            <input
              type="number"
              className={clsx('form-control form-control-sm', errors.manualPoints && 'is-invalid')}
              id={`${idPrefix}-manualPoints`}
              aria-invalid={!!errors.manualPoints}
              aria-errormessage={errors.manualPoints ? `${idPrefix}-manualPoints-error` : undefined}
              aria-describedby={`${idPrefix}-manualPoints-help`}
              {...register('manualPoints', {
                setValueAs: coerceToNumber,
                validate: (v) => {
                  if (v != null && v < 0) return 'Manual points must be non-negative.';
                },
              })}
            />
            {errors.manualPoints && (
              <div id={`${idPrefix}-manualPoints-error`} className="invalid-feedback">
                {errors.manualPoints.message}
              </div>
            )}
            <small id={`${idPrefix}-manualPoints-help`} className="form-text text-muted">
              Default manual points inherited by alternatives unless overridden.
            </small>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3">
            <label htmlFor={`${idPrefix}-points`} className="form-label">
              Points list (default)
            </label>
            <input
              type="text"
              className={clsx('form-control form-control-sm', errors.points && 'is-invalid')}
              id={`${idPrefix}-points`}
              aria-invalid={!!errors.points}
              aria-errormessage={errors.points ? `${idPrefix}-points-error` : undefined}
              aria-describedby={`${idPrefix}-points-help`}
              {...register('points', {
                setValueAs: parsePointsListValue,
                validate: (v) => validateNonIncreasingPoints(v),
              })}
            />
            {errors.points && (
              <div id={`${idPrefix}-points-error`} className="invalid-feedback">
                {errors.points.message}
              </div>
            )}
            <small id={`${idPrefix}-points-help`} className="form-text text-muted">
              Default points list inherited by alternatives unless overridden.
            </small>
          </div>
          <div className="mb-3">
            <label htmlFor={`${idPrefix}-manualPoints`} className="form-label">
              Manual points (default)
            </label>
            <input
              type="number"
              className={clsx('form-control form-control-sm', errors.manualPoints && 'is-invalid')}
              id={`${idPrefix}-manualPoints`}
              aria-invalid={!!errors.manualPoints}
              aria-errormessage={errors.manualPoints ? `${idPrefix}-manualPoints-error` : undefined}
              aria-describedby={`${idPrefix}-manualPoints-help`}
              {...register('manualPoints', {
                setValueAs: coerceToNumber,
                validate: (v) => {
                  if (v != null && v < 0) return 'Manual points must be non-negative.';
                },
              })}
            />
            {errors.manualPoints && (
              <div id={`${idPrefix}-manualPoints-error`} className="invalid-feedback">
                {errors.manualPoints.message}
              </div>
            )}
            <small id={`${idPrefix}-manualPoints-help`} className="form-text text-muted">
              Default manual points inherited by alternatives unless overridden.
            </small>
          </div>
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
        variant="altGroup"
        inheritance={advancedInheritance}
      />

      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => onAddAlternative(zoneQuestionBlock.trackingId)}
        >
          Add alternative
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={() => onDelete(zoneQuestionBlock.trackingId, '')}
        >
          Delete alternative group
        </button>
      </div>
    </div>
  );
}
