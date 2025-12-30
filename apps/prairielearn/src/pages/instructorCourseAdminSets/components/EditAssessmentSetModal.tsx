import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Modal } from 'react-bootstrap';

import { ColorSwatch } from '../../../components/ColorSwatch.js';
import type { StaffAssessmentSet } from '../../../lib/client/safe-db-types.js';
import { ColorJsonSchema } from '../../../schemas/index.js';

export type EditAssessmentSetsModalState =
  | { type: 'closed' }
  | { type: 'create'; assessmentSet: StaffAssessmentSet }
  | { type: 'edit'; assessmentSet: StaffAssessmentSet };

export function EditAssessmentSetsModal({
  state,
  onClose,
  onSave,
}: {
  state: EditAssessmentSetsModalState;
  onClose: () => void;
  onSave: (assessmentSet: StaffAssessmentSet) => void;
}) {
  const assessmentSetToEdit =
    state.type === 'create'
      ? state.assessmentSet
      : state.type === 'edit'
        ? state.assessmentSet
        : null;
  const [assessmentSet, setAssessmentSet] = useState<StaffAssessmentSet | null>(
    assessmentSetToEdit,
  );
  const [invalidAbbreviation, setInvalidAbbreviation] = useState(false);
  const [invalidName, setInvalidName] = useState(false);
  const [invalidColor, setInvalidColor] = useState(false);

  function handleModalEntering() {
    if (!assessmentSetToEdit) return;
    setAssessmentSet(assessmentSetToEdit);
    setInvalidName(false);
    setInvalidColor(false);
  }

  function handleModalExited() {
    setAssessmentSet(null);
    setInvalidName(false);
    setInvalidColor(false);
  }

  function handleSubmit() {
    if (!assessmentSet) return;

    const isAbbreviationValid = !!assessmentSet.abbreviation;
    const isNameValid = !!assessmentSet.name;
    const isColorValid = !!assessmentSet.color;

    setInvalidAbbreviation(!isAbbreviationValid);
    setInvalidName(!isNameValid);
    setInvalidColor(!isColorValid);

    if (isAbbreviationValid && isNameValid && isColorValid) {
      onSave(assessmentSet);
    }
  }

  return (
    <Modal
      show={state.type !== 'closed'}
      onHide={onClose}
      onEntering={handleModalEntering}
      onExited={handleModalExited}
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {state.type === 'create' ? 'Add assessment set' : 'Edit assessment set'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {assessmentSet ? (
          <>
            <div class="d-flex flex-column align-items-center mb-4">
              <span class={`badge color-${assessmentSet.color}`}>
                {assessmentSet.abbreviation || 'Preview'}
              </span>
            </div>
            <div class="mb-3">
              <label class="form-label" for="abbreviation">
                Abbreviation
              </label>
              <input
                type="text"
                class={clsx('form-control', invalidAbbreviation && 'is-invalid')}
                id="abbreviation"
                value={assessmentSet.abbreviation}
                onChange={(e) =>
                  setAssessmentSet({
                    ...assessmentSet,
                    abbreviation: (e.target as HTMLInputElement).value,
                  })
                }
              />
              {invalidAbbreviation && (
                <div class="invalid-feedback">Assessment set abbreviation is required</div>
              )}
            </div>
            <div class="mb-3">
              <label class="form-label" for="name">
                Name
              </label>
              <input
                type="text"
                class={clsx('form-control', invalidName && 'is-invalid')}
                id="name"
                value={assessmentSet.name}
                onChange={(e) =>
                  setAssessmentSet({ ...assessmentSet, name: (e.target as HTMLInputElement).value })
                }
              />
              {invalidName && <div class="invalid-feedback">Assessment set name is required</div>}
            </div>
            <div class="mb-3">
              <label class="form-label" for="heading">
                Heading
              </label>
              <input
                type="text"
                class="form-control"
                id="heading"
                value={assessmentSet.heading}
                onChange={(e) =>
                  setAssessmentSet({
                    ...assessmentSet,
                    heading: (e.target as HTMLInputElement).value,
                  })
                }
              />
            </div>
            <div class="mb-3">
              <label class="form-label" for="color">
                Color
              </label>
              <div class="d-flex gap-2 align-items-center">
                <select
                  class={clsx('form-select', invalidColor && 'is-invalid')}
                  id="color"
                  value={assessmentSet.color}
                  onChange={(e) =>
                    setAssessmentSet({
                      ...assessmentSet,
                      color: e.currentTarget.value,
                    })
                  }
                >
                  {ColorJsonSchema.options.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
                <ColorSwatch color={assessmentSet.color} />
              </div>
              {invalidColor && <div class="invalid-feedback">Assessment set color is required</div>}
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button class="btn btn-secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onClick={handleSubmit}>
          Save
        </button>
      </Modal.Footer>
    </Modal>
  );
}
