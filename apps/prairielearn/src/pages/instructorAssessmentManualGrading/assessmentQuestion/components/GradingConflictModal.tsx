import { Button, Modal } from 'react-bootstrap';

export type ConflictModalState = {
  type: 'conflict';
  conflictDetailsUrl: string;
} | null;

export function GradingConflictModal({
  modalState,
  onHide,
}: {
  modalState: ConflictModalState;
  onHide: () => void;
}) {
  return (
    <Modal show={modalState != null} onHide={onHide}>
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
        <Button variant="primary" href={modalState?.conflictDetailsUrl}>
          See details
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
