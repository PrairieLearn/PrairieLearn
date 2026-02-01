import { Button, Modal } from 'react-bootstrap';

export function AiGradingUnavailableModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>AI grading not available</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          AI grading is specifically for questions that use manual grading. Currently, this question
          does not: <code>max_manual_points</code> is 0.
        </p>
        <p className="mb-0">
          To use AI grading, add manual points in the assessment configuration. See the{' '}
          <a
            href="https://prairielearn.readthedocs.io/en/latest/manualGrading/#configuring-a-question-for-manual-grading"
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
