import clsx from 'clsx';
import { useState } from 'react';
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
  existingNames,
}: {
  state: EditAssessmentSetsModalState;
  onClose: () => void;
  onSave: (assessmentSet: StaffAssessmentSet) => void;
  existingNames: Set<string>;
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
    setInvalidAbbreviation(false);
    setInvalidColor(false);
  }

  function handleModalExited() {
    setAssessmentSet(null);
    setInvalidName(false);
    setInvalidAbbreviation(false);
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
            <div className="d-flex flex-column align-items-center mb-4">
              <span className={`badge color-${assessmentSet.color}`}>
                {assessmentSet.abbreviation || 'Preview'}
              </span>
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="abbreviation">
                Abbreviation
              </label>
              <input
                type="text"
                className={clsx('form-control', invalidAbbreviation && 'is-invalid')}
                id="abbreviation"
                value={assessmentSet.abbreviation}
                aria-invalid={invalidAbbreviation}
                aria-describedby={invalidAbbreviation ? 'abbreviation-error' : undefined}
                onChange={(e) =>
                  setAssessmentSet({
                    ...assessmentSet,
                    abbreviation: (e.target as HTMLInputElement).value,
                  })
                }
              />
              {invalidAbbreviation && (
                <div id="abbreviation-error" className="invalid-feedback">
                  Assessment set abbreviation is required
                </div>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="name">
                Name
              </label>
              <input
                type="text"
                className={clsx('form-control', invalidName && 'is-invalid')}
                id="name"
                value={assessmentSet.name}
                aria-invalid={invalidName}
                aria-describedby={
                  [
                    invalidName ? 'name-error' : null,
                    state.type !== 'closed' &&
                    assessmentSet.name &&
                    existingNames.has(assessmentSet.name)
                      ? 'name-warning'
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                onChange={(e) =>
                  setAssessmentSet({ ...assessmentSet, name: (e.target as HTMLInputElement).value })
                }
              />
              {invalidName && (
                <div id="name-error" className="invalid-feedback">
                  Assessment set name is required
                </div>
              )}
              {state.type !== 'closed' &&
                assessmentSet.name &&
                existingNames.has(assessmentSet.name) && (
                  <div
                    id="name-warning"
                    className="alert alert-warning mt-2 mb-0 py-2"
                    role="alert"
                  >
                    <i className="fa fa-exclamation-triangle" aria-hidden="true" /> This assessment
                    set has the same name as another set.
                  </div>
                )}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="heading">
                Heading
              </label>
              <input
                type="text"
                className="form-control"
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
            <div className="mb-3">
              <label className="form-label" htmlFor="color">
                Color
              </label>
              <div className="d-flex gap-2 align-items-center">
                <select
                  className={clsx('form-select', invalidColor && 'is-invalid')}
                  id="color"
                  value={assessmentSet.color}
                  aria-invalid={invalidColor}
                  aria-describedby={invalidColor ? 'color-error' : undefined}
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
              {invalidColor && (
                <div id="color-error" className="invalid-feedback d-block">
                  Assessment set color is required
                </div>
              )}
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" type="button" onClick={handleSubmit}>
          Save
        </button>
      </Modal.Footer>
    </Modal>
  );
}
