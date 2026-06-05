import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import type { AssessmentModuleFormRow } from '../instructorCourseAdminModules.types.js';

export interface EditAssessmentModuleModalData {
  mode: 'create' | 'edit';
  assessmentModule: AssessmentModuleFormRow;
}

export function EditAssessmentModuleModal({
  show,
  data,
  onHide,
  onExited,
  onSave,
  existingNames,
}: {
  show: boolean;
  data: EditAssessmentModuleModalData | null;
  onHide: () => void;
  onExited: () => void;
  onSave: (assessmentModule: AssessmentModuleFormRow) => void;
  existingNames: Set<string>;
}) {
  const [assessmentModule, setAssessmentModule] = useState<AssessmentModuleFormRow | null>(null);

  function handleModalEntering() {
    if (!data) return;
    setAssessmentModule(data.assessmentModule);
  }

  function handleModalExited() {
    setAssessmentModule(null);
    onExited();
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!assessmentModule) return;
    onSave({
      ...assessmentModule,
      name: assessmentModule.name.trim(),
      heading: assessmentModule.heading.trim(),
    });
  }

  const nameConflicts =
    !!assessmentModule?.name && show && existingNames.has(assessmentModule.name.trim());

  return (
    <Modal
      show={show}
      onHide={onHide}
      onEntering={handleModalEntering}
      onExited={handleModalExited}
    >
      <Modal.Header closeButton>
        <Modal.Title>{data?.mode === 'create' ? 'Add module' : 'Edit module'}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit}>
        <Modal.Body>
          {assessmentModule ? (
            <>
              <div className="mb-3">
                <label className="form-label" htmlFor="module-name">
                  Name
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="module-name"
                  value={assessmentModule.name}
                  aria-describedby={nameConflicts ? 'module-name-warning' : undefined}
                  required
                  onChange={({ currentTarget }) =>
                    setAssessmentModule({ ...assessmentModule, name: currentTarget.value })
                  }
                />
                <small className="form-text text-muted">
                  Short name for the module (preferably 1 to 3 words), e.g. "Introduction".
                </small>
                {nameConflicts && (
                  <div
                    id="module-name-warning"
                    className="alert alert-warning mt-2 mb-0 py-2"
                    role="alert"
                  >
                    <i className="fa fa-exclamation-triangle" aria-hidden="true" /> This module has
                    the same name as another module.
                  </div>
                )}
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="module-heading">
                  Heading
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="module-heading"
                  value={assessmentModule.heading}
                  required
                  onChange={({ currentTarget }) =>
                    setAssessmentModule({ ...assessmentModule, heading: currentTarget.value })
                  }
                />
                <small className="form-text text-muted">
                  Full name of the module, visible to students.
                </small>
              </div>
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-secondary" type="button" onClick={onHide}>
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
