import { Button, Modal } from 'react-bootstrap';

export function GradingConflictModal({
  show,
  conflictDetailsUrl,
  onHide,
}: {
  show: boolean;
  conflictDetailsUrl: string;
  onHide: () => void;
}) {
  return (
    <Modal show={show} size="lg" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Grading conflict detected</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p>Another grader has already graded this submission.</p>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Dismiss
        </Button>
        <Button variant="primary" href={conflictDetailsUrl}>
          See details
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
