import { Alert } from 'react-bootstrap';

export function ReviewSubmissionsAlert({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <Alert variant="info" className="mb-3" dismissible={!!onDismiss} onClose={onDismiss}>
      <div className="d-flex flex-wrap align-items-center gap-2 gap-lg-3">
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <i className="bi bi-stars fs-5" aria-hidden="true" />
          <strong>Review AI-graded submissions</strong>
        </div>
        <span className="small text-body-secondary">
          Open an instance below to review the AI grading.
        </span>
      </div>
    </Alert>
  );
}
