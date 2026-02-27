import { Modal } from 'react-bootstrap';

export function ResetQuestionVariantsModal({
  csrfToken,
  assessmentQuestionId,
  show,
  onHide,
  onExited,
}: {
  csrfToken: string;
  assessmentQuestionId: string;
  show: boolean;
  onHide: () => void;
  onExited?: () => void;
}) {
  return (
    <Modal show={show} size="lg" backdrop="static" onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>Confirm reset question variants</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to reset all current variants of this question?{' '}
          <strong>All ungraded attempts will be lost.</strong>
        </p>
        <p>Students will receive a new variant the next time they view this question.</p>
      </Modal.Body>
      <Modal.Footer>
        <form method="POST">
          <input type="hidden" name="__action" value="reset_question_variants" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="unsafe_assessment_question_id" value={assessmentQuestionId} />
          <button type="button" className="btn btn-secondary me-1" onClick={onHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger">
            Reset question variants
          </button>
        </form>
      </Modal.Footer>
    </Modal>
  );
}
