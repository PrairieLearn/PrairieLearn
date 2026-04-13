import { Modal } from 'react-bootstrap';

export function ConfirmFinishModal({
  show,
  onHide,
  allQuestionsAnswered,
  csrfToken,
}: {
  show: boolean;
  onHide: () => void;
  allQuestionsAnswered: boolean;
  csrfToken: string;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <form method="POST">
        <Modal.Header closeButton>
          <Modal.Title>All done?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!allQuestionsAnswered && (
            <div className="alert alert-warning">There are still unanswered questions.</div>
          )}
          <p className="text-danger">
            <strong>Warning</strong>: You will not be able to answer any more questions after
            finishing the assessment.
          </p>
          <p>Are you sure you want to finish, complete, and close out the assessment?</p>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" name="__action" value="finish">
            Finish assessment
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export function CrossLockpointModal({
  show,
  onHide,
  zoneId,
  isGroupAssessment,
  confirmed,
  onConfirmChange,
  csrfToken,
}: {
  show: boolean;
  onHide: () => void;
  zoneId: string | null;
  isGroupAssessment: boolean;
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  csrfToken: string;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <form method="POST">
        <Modal.Header closeButton>
          <Modal.Title>Proceed to next questions?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            After proceeding, you will not be able to submit answers to previous questions. You can
            still review your previous submissions.
          </p>
          {isGroupAssessment && (
            <p className="fw-bold">
              This will affect all group members. No one in your group will be able to submit
              answers to previous questions.
            </p>
          )}
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="lockpoint-confirm"
              checked={confirmed}
              onChange={(e) => onConfirmChange(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="lockpoint-confirm">
              I understand that I will not be able to submit answers to previous questions
            </label>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="zone_id" value={zoneId ?? ''} />
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Cancel
          </button>
          <button
            type="submit"
            name="__action"
            value="cross_lockpoint"
            className="btn btn-warning"
            disabled={!confirmed}
          >
            Confirm
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export function TimeLimitExpiredModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Time limit expired</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Your time limit expired and your assessment is now finished.</p>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-primary" onClick={onHide}>
          OK
        </button>
      </Modal.Footer>
    </Modal>
  );
}
