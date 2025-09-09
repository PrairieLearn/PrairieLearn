import { useState } from 'preact/compat';
import { Button, Form, InputGroup, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { QRCodeModal } from '../../../components/QRCodeModal.js';

export function SelfEnrollmentSettings({
  selfEnrollLink,
  csrfToken,
}: {
  selfEnrollLink: string;
  csrfToken: string;
}) {
  const [showQR, setShowQR] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <div class="mb-3">
      <label class="form-label" for="self_enrollment_link">
        Self-enrollment Link
      </label>
      <InputGroup>
        <Form.Control id="self_enrollment_link" value={selfEnrollLink} disabled />
        <OverlayTrigger overlay={<Tooltip>Copy</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(selfEnrollLink);
            }}
            aria-label="Copy self-enrollment link"
          >
            <i class="bi bi-clipboard" />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger overlay={<Tooltip>View QR Code</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowQR(true)}
            aria-label="Self-enrollment Link QR Code"
          >
            <i class="bi bi-qr-code-scan" />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger overlay={<Tooltip>Regenerate</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowConfirm(true)}
            aria-label="Generate new self-enrollment link"
          >
            <i class="bi-arrow-repeat" />
          </Button>
        </OverlayTrigger>
      </InputGroup>
      <small class="form-text text-muted">
        This is the link that students will use to enroll in the course if self-enrollment is
        enabled.
      </small>
      <QRCodeModal
        id="selfEnrollmentLinkModal"
        title="Self-enrollment Link QR Code"
        content={selfEnrollLink}
        show={showQR}
        onHide={() => setShowQR(false)}
      />
      <Modal show={showConfirm} onHide={() => setShowConfirm(false)} backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Generate new self-enrollment link</Modal.Title>
        </Modal.Header>
        <form method="POST">
          <Modal.Body>
            <div>
              Are you sure you want to generate a new self-enrollment link?{' '}
              <strong>The current link will be deactivated.</strong> This action cannot be undone.
            </div>
          </Modal.Body>
          <Modal.Footer>
            <input type="hidden" name="__action" value="generate_enrollment_code" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <Button variant="secondary" type="button" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="submit">
              Generate new link
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </div>
  );
}
