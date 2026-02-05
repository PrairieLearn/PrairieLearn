import { Button, Modal } from 'react-bootstrap';

export function AiGradingUnavailableModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>AI grading not available</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          AI grading is only supported for questions with a manually graded portion. To enable
          manual grading, set <code>manualPoints</code> to a non-zero value.
        </p>
        <p className="mb-0">
          See the{' '}
          <a
            href="https://prairielearn.readthedocs.io/en/latest/manualGrading/"
            target="_blank"
            rel="noopener noreferrer"
          >
            manual grading documentation
          </a>{' '}
          for more info.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
