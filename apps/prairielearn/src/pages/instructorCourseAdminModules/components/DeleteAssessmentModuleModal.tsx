import { Modal } from 'react-bootstrap';

import type { AssessmentModuleFormRow } from '../instructorCourseAdminModules.types.js';

export type DeleteAssessmentModuleModalData = AssessmentModuleFormRow;

export function DeleteAssessmentModuleModal({
  show,
  data,
  onHide,
  onExited,
  onConfirm,
}: {
  show: boolean;
  data: DeleteAssessmentModuleModalData | null;
  onHide: () => void;
  onExited: () => void;
  onConfirm: (module: AssessmentModuleFormRow) => void;
}) {
  const count = data?.assessments.length ?? 0;

  return (
    <Modal show={show} onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>Delete module</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {data && (
          <p className="mb-0">
            Deleting <strong>{data.name}</strong> will move its {count} assessment
            {count === 1 ? '' : 's'} to the <strong>Default</strong> module. This takes effect when
            you save your changes.
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-secondary" type="button" onClick={onHide}>
          Cancel
        </button>
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => {
            if (data) onConfirm(data);
          }}
        >
          Delete module
        </button>
      </Modal.Footer>
    </Modal>
  );
}

DeleteAssessmentModuleModal.displayName = 'DeleteAssessmentModuleModal';
