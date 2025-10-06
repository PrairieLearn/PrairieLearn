import { Modal } from 'react-bootstrap';

import { EnrollmentCodeForm } from '../../components/EnrollmentCodeForm.js';
import { getSelfEnrollmentLinkUrl } from '../../lib/client/url.js';

interface EnrollmentCodeModalProps {
  show: boolean;
  onHide: () => void;
}

export function EnrollmentCodeModal({ show, onHide }: EnrollmentCodeModalProps) {
  const handleValidEnrollmentCode = (courseInstanceId: number, enrollmentCode: string) => {
    // Redirect to the join page
    window.location.href = getSelfEnrollmentLinkUrl({
      courseInstanceId: courseInstanceId.toString(),
      enrollmentCode,
    });
  };

  return (
    <Modal key={show ? 'open' : 'closed'} show={show} size="md" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Join a course</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <EnrollmentCodeForm
          style="modal"
          // eslint-disable-next-line jsx-a11y-x/no-autofocus
          autoFocus={true}
          onValidEnrollmentCode={handleValidEnrollmentCode}
        />
      </Modal.Body>
      <Modal.Footer>
        <button type="button" class="btn btn-secondary" onClick={onHide}>
          Cancel
        </button>
      </Modal.Footer>
    </Modal>
  );
}
