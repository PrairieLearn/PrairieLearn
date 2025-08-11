import { useState } from 'preact/compat';
import { Modal } from 'react-bootstrap';

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

  return (
    <Modal show={show} backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Invite student</Modal.Title>
      </Modal.Header>
      <form onSubmit={(e) => e.preventDefault()}>
        <Modal.Body>
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
                await onSubmit(uid.trim());
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
