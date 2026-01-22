import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';

export type EditZoneModalState =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; zone: ZoneAssessmentJson; zoneIndex: number };

interface ZoneFormData {
  title: string;
  maxPoints?: number;
  numberChoose?: number;
  bestQuestions?: number;
}

function validatePositiveInteger(value: number | undefined, fieldName: string) {
  if (value !== undefined && value < 1) {
    return `${fieldName} must be at least 1.`;
  }
  if (value !== undefined && !Number.isInteger(value)) {
    return `${fieldName} must be an integer.`;
  }
}

export function EditZoneModal({
  editZoneModalState,
  onHide,
  handleSaveZone,
}: {
  editZoneModalState: EditZoneModalState;
  onHide: () => void;
  handleSaveZone: (zone: Partial<ZoneAssessmentJson>, zoneIndex?: number) => void;
}) {
  const { type } = editZoneModalState;
  const existingZone = type === 'edit' ? editZoneModalState.zone : undefined;
  const zoneIndex = type === 'edit' ? editZoneModalState.zoneIndex : undefined;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ZoneFormData>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      title: existingZone?.title ?? '',
      maxPoints: existingZone?.maxPoints ?? undefined,
      numberChoose: existingZone?.numberChoose ?? undefined,
      bestQuestions: existingZone?.bestQuestions ?? undefined,
    },
  });

  if (type === 'closed') return null;

  return (
    <Modal show={true} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{type === 'create' ? 'Add zone' : 'Edit zone'}</Modal.Title>
      </Modal.Header>
      <form
        onSubmit={handleSubmit((data) => {
          const zone: Partial<ZoneAssessmentJson> = {
            title: data.title || undefined,
            maxPoints: data.maxPoints,
            numberChoose: data.numberChoose,
            bestQuestions: data.bestQuestions,
            questions: type === 'create' ? [] : existingZone?.questions,
          };
          handleSaveZone(zone, zoneIndex);
        })}
      >
        <Modal.Body>
          <div className="mb-3">
            <label htmlFor="titleInput">Title</label>
            <input type="text" className="form-control" id="titleInput" {...register('title')} />
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
              className={`form-control ${errors.numberChoose ? 'is-invalid' : ''}`}
              id="numberChooseInput"
              {...register('numberChoose', {
                setValueAs: (value: string) => {
                  if (value === '') return undefined;
                  return Number(value);
                },
                validate: (value) => validatePositiveInteger(value, 'Number to choose'),
              })}
            />
            {errors.numberChoose && (
              <div className="invalid-feedback">{errors.numberChoose.message}</div>
            )}
            <small id="numberChooseHelp" className="form-text text-muted">
              Number of questions to choose from this zone (leave empty for all).
            </small>
          </div>

          <div className="mb-3">
            <label htmlFor="bestQuestionsInput">Best questions</label>
            <input
              type="number"
              className={`form-control ${errors.bestQuestions ? 'is-invalid' : ''}`}
              id="bestQuestionsInput"
              {...register('bestQuestions', {
                setValueAs: (value: string) => {
                  if (value === '') return undefined;
                  return Number(value);
                },
                validate: (value) => validatePositiveInteger(value, 'Best questions'),
              })}
            />
            {errors.bestQuestions && (
              <div className="invalid-feedback">{errors.bestQuestions.message}</div>
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
