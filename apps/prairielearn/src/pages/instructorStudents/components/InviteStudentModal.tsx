import { useState } from 'preact/compat';
import { Alert, Modal } from 'react-bootstrap';

export function InviteStudentModal({
  show,
  onHide,
  onSubmit,
}: {
  show: boolean;
  onHide: () => void;
  onSubmit: (uid: string) => Promise<void> | void;
}) {
  const [uid, setUid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      show={show}
      backdrop="static"
      onHide={() => {
        setError(null);
        onHide();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Invite student</Modal.Title>
      </Modal.Header>

      <form onSubmit={(e) => e.preventDefault()}>
        <Modal.Body>
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <div class="mb-3">
            <label for="invite-uid" class="form-label">
              UID
            </label>
            <input
              id="invite-uid"
              class="form-control"
              type="email"
              value={uid}
              placeholder="Enter UID"
              onInput={(e) => {
                if (!(e.target instanceof HTMLInputElement)) return;
                setUid(e.target.value);
              }}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" class="btn btn-secondary" disabled={submitting} onClick={onHide}>
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={!uid || submitting}
            onClick={async () => {
              try {
                setSubmitting(true);
                setError(null);
                await onSubmit(uid.trim());
              } catch (e) {
                const message = e instanceof Error ? e.message : 'Failed to invite';
                setError(message);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Invite
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
