import { Modal } from 'react-bootstrap';

interface GenerateTokenModalProps {
  show: boolean;
  csrfToken: string;
  onClose: () => void;
}

export function GenerateTokenModal({ show, csrfToken, onClose }: GenerateTokenModalProps) {
  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Generate new token</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form method="POST" id="generate-token-form">
          <input type="hidden" name="__action" value="token_generate" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <div className="mb-3">
            <label className="form-label" htmlFor="token_name">
              Name:
            </label>
            <input
              type="text"
              className="form-control"
              id="token_name"
              name="token_name"
              placeholder="My token"
              autoComplete="off"
              required
            />
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" form="generate-token-form">
          Generate token
        </button>
      </Modal.Footer>
    </Modal>
  );
}

GenerateTokenModal.displayName = 'GenerateTokenModal';
