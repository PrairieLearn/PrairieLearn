import clsx from 'clsx';
import { useMemo } from 'react';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import type { ZoneAssessmentForm } from '../types.js';
import { validatePositiveInteger } from '../utils/questions.js';

export type EditZoneModalData =
  | { type: 'create' }
  | { type: 'edit'; zone: ZoneAssessmentForm; zoneTrackingId: string };

interface ZoneFormData {
  title: string;
  maxPoints?: number;
  numberChoose?: number;
  bestQuestions?: number;
}

export function EditZoneModal({
  show,
  data,
  onHide,
  onExited,
  handleSaveZone,
}: {
  show: boolean;
  data: EditZoneModalData | null;
  onHide: () => void;
  onExited: () => void;
  handleSaveZone: (zone: Partial<ZoneAssessmentForm>, zoneTrackingId?: string) => void;
}) {
  const type = data?.type ?? null;
  const existingZone = data?.type === 'edit' ? data.zone : undefined;
  const zoneTrackingId = data?.type === 'edit' ? data.zoneTrackingId : undefined;

  // Compute form values from data - useForm with `values` will auto-update
  const formValues = useMemo<ZoneFormData>(
    () => ({
      title: existingZone?.title ?? '',
      maxPoints: existingZone?.maxPoints ?? undefined,
      numberChoose: existingZone?.numberChoose ?? undefined,
      bestQuestions: existingZone?.bestQuestions ?? undefined,
    }),
    [existingZone],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ZoneFormData>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    values: formValues,
  });

  return (
    <Modal show={show} onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>{type === 'create' ? 'Add zone' : 'Edit zone'}</Modal.Title>
      </Modal.Header>
      <form
        onSubmit={handleSubmit((formData) => {
          const zone: Partial<ZoneAssessmentForm> = {
            title: formData.title || undefined,
            maxPoints: formData.maxPoints,
            numberChoose: formData.numberChoose,
            bestQuestions: formData.bestQuestions,
            questions: type === 'create' ? [] : existingZone?.questions,
          };
          handleSaveZone(zone, zoneTrackingId);
        })}
      >
        <Modal.Body>
          <div className="mb-3">
            <label htmlFor="titleInput">Title</label>
            <input
              type="text"
              className="form-control"
              id="titleInput"
              aria-describedby="titleHelp"
              {...register('title')}
            />
            <small id="titleHelp" className="form-text text-muted">
              The title of the zone (optional).
            </small>
          </div>

          <div className="mb-3">
            <label htmlFor="maxPointsInput">Max points</label>
            <input
              type="number"
              className="form-control"
              id="maxPointsInput"
              aria-describedby="maxPointsHelp"
              {...register('maxPoints', {
                setValueAs: (value: string) => {
                  if (value === '') return undefined;
                  return Number(value);
                },
              })}
            />
            <small id="maxPointsHelp" className="form-text text-muted">
              Maximum points that can be earned from this zone (optional).
            </small>
          </div>

          <div className="mb-3">
            <label htmlFor="numberChooseInput">Number to choose</label>
            <input
              type="number"
              className={clsx('form-control', errors.numberChoose && 'is-invalid')}
              id="numberChooseInput"
              aria-invalid={!!errors.numberChoose}
              aria-errormessage={errors.numberChoose ? 'numberChooseError' : undefined}
              aria-describedby="numberChooseHelp"
              {...register('numberChoose', {
                setValueAs: (value: string) => {
                  if (value === '') return undefined;
                  return Number(value);
                },
                validate: (value) => validatePositiveInteger(value, 'Number to choose'),
              })}
            />
            {errors.numberChoose && (
              <div id="numberChooseError" className="invalid-feedback">
                {errors.numberChoose.message}
              </div>
            )}
            <small id="numberChooseHelp" className="form-text text-muted">
              Number of questions to choose from this zone (leave empty for all).
            </small>
          </div>

          <div className="mb-3">
            <label htmlFor="bestQuestionsInput">Best questions</label>
            <input
              type="number"
              className={clsx('form-control', errors.bestQuestions && 'is-invalid')}
              id="bestQuestionsInput"
              aria-invalid={!!errors.bestQuestions}
              aria-errormessage={errors.bestQuestions ? 'bestQuestionsError' : undefined}
              aria-describedby="bestQuestionsHelp"
              {...register('bestQuestions', {
                setValueAs: (value: string) => {
                  if (value === '') return undefined;
                  return Number(value);
                },
                validate: (value) => validatePositiveInteger(value, 'Best questions'),
              })}
            />
            {errors.bestQuestions && (
              <div id="bestQuestionsError" className="invalid-feedback">
                {errors.bestQuestions.message}
              </div>
            )}
            <small id="bestQuestionsHelp" className="form-text text-muted">
              Only count points from the best N questions (optional).
            </small>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Close
          </button>
          <button type="submit" className="btn btn-primary">
            {type === 'create' ? 'Add zone' : 'Update zone'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
