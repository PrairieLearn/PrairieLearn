import { useState } from 'preact/compat';
import { Modal } from 'react-bootstrap';

import type { StaffAssessmentSet } from '../../../lib/client/safe-db-types.js';

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

    const isNameValid = !!assessmentSet.name;
    const isColorValid = !!assessmentSet.color;

    setInvalidName(!isNameValid);
    setInvalidColor(!isColorValid);

    if (isNameValid && isColorValid) {
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
            <div class="mb-3">
              <label class="form-label" for="name">
                Name
              </label>
              <input
                type="text"
                class="form-control"
                id="name"
                value={assessmentSet.name}
                onChange={(e) =>
                  setAssessmentSet({ ...assessmentSet, name: (e.target as HTMLInputElement).value })
                }
              />
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button class="btn btn-secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button class="btn btn-primary" type="submit">
          Save
        </button>
      </Modal.Footer>
    </Modal>
  );
}
