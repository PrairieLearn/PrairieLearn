import { Button, Modal } from 'react-bootstrap';

export function ExamResetNotSupportedModal({
  show,
  onHide,
}: {
  show: boolean;
  onHide: () => void;
}) {
  return (
    <Modal show={show} size="lg" backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Not supported</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Resetting question variants is not supported for Exam assessments.</p>
        <p class="mb-0">
          Consider alternative options, such as deleting assessment instances to allow students to
          start over.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
