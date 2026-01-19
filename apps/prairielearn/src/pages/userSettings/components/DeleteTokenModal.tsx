import { Modal } from 'react-bootstrap';

import type { AccessToken } from './UserSettingsPage.js';

interface DeleteTokenModalProps {
  token: AccessToken | null;
  csrfToken: string;
  onClose: () => void;
}

export function DeleteTokenModal({ token, csrfToken, onClose }: DeleteTokenModalProps) {
  return (
    <Modal show={token !== null} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Delete this token</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form method="POST" id="delete-token-form">
          <input type="hidden" name="__action" value="token_delete" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="token_id" value={token?.id ?? ''} />
          <p>
            Once you delete this token, any applications using it will no longer be able to access
            the API. You cannot undo this action.
          </p>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-danger" form="delete-token-form">
          Delete token
        </button>
      </Modal.Footer>
    </Modal>
  );
}

DeleteTokenModal.displayName = 'DeleteTokenModal';
