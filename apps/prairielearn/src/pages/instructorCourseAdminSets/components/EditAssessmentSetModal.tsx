import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { ColorSwatch } from '../../../components/ColorSwatch.js';
import { ColorJsonSchema } from '../../../schemas/index.js';
import type { InstructorCourseAdminSetFormRow } from '../instructorCourseAdminSets.shared.js';

export type EditAssessmentSetsModalState =
  | { type: 'closed' }
  | { type: 'create'; assessmentSet: InstructorCourseAdminSetFormRow }
  | { type: 'edit'; assessmentSet: InstructorCourseAdminSetFormRow };

export function EditAssessmentSetsModal({
  state,
  onClose,
  onSave,
  existingNames,
}: {
  state: EditAssessmentSetsModalState;
  onClose: () => void;
  onSave: (assessmentSet: InstructorCourseAdminSetFormRow) => void;
  existingNames: Set<string>;
}) {
  const assessmentSetToEdit =
    state.type === 'create'
      ? state.assessmentSet
      : state.type === 'edit'
        ? state.assessmentSet
        : null;
  const [assessmentSet, setAssessmentSet] = useState<InstructorCourseAdminSetFormRow | null>(
    assessmentSetToEdit,
  );

  function handleModalEntering() {
    if (!assessmentSetToEdit) return;
    setAssessmentSet(assessmentSetToEdit);
  }

  function handleModalExited() {
    setAssessmentSet(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assessmentSet) return;
    onSave(assessmentSet);
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
      <form onSubmit={handleSubmit}>
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
                  className="form-control"
                  id="abbreviation"
                  value={assessmentSet.abbreviation}
                  required
                  onChange={({ currentTarget }) =>
                    setAssessmentSet({
                      ...assessmentSet,
                      abbreviation: currentTarget.value,
                    })
                  }
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="name">
                  Name
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="name"
                  value={assessmentSet.name}
                  aria-describedby={
                    state.type !== 'closed' &&
                    assessmentSet.name &&
                    existingNames.has(assessmentSet.name)
                      ? 'name-warning'
                      : undefined
                  }
                  required
                  onChange={({ currentTarget }) =>
                    setAssessmentSet({
                      ...assessmentSet,
                      name: currentTarget.value,
                    })
                  }
                />
                {state.type !== 'closed' &&
                  assessmentSet.name &&
                  existingNames.has(assessmentSet.name) && (
                    <div
                      id="name-warning"
                      className="alert alert-warning mt-2 mb-0 py-2"
                      role="alert"
                    >
                      <i className="fa fa-exclamation-triangle" aria-hidden="true" /> This
                      assessment set has the same name as another set.
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
                  onChange={({ currentTarget }) =>
                    setAssessmentSet({
                      ...assessmentSet,
                      heading: currentTarget.value,
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
                    className="form-select"
                    id="color"
                    value={assessmentSet.color}
                    required
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
              </div>
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
