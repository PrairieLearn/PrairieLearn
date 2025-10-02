import { useState } from 'preact/compat';
import { Button, Form, InputGroup, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { html } from '@prairielearn/html';

import { QRCodeModal } from './QRCodeModal.js';

export function PublicLinkSharingHtml({
  publicLink,
  sharingMessage,
  publicLinkMessage,
}: {
  publicLink: string;
  sharingMessage: string;
  publicLinkMessage: string;
}) {
  return html`
    <p>
      <span class="badge color-green3 me-1">Public source</span>
      ${sharingMessage}
    </p>
    <div class="mb-3">
      <label for="publicLink">Public link</label>
      <span class="input-group">
        <input
          type="text"
          class="form-control"
          id="publicLink"
          name="publicLink"
          value="${publicLink}"
          disabled
        />
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary btn-copy"
          data-clipboard-text="${publicLink}"
          aria-label="Copy public link"
        >
          <i class="far fa-clipboard"></i>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          aria-label="Public Link QR Code"
          data-bs-toggle="modal"
          data-bs-target="#publicLinkModal"
        >
          <i class="fas fa-qrcode"></i>
        </button>
      </span>
      <small class="form-text text-muted"> ${publicLinkMessage} </small>
    </div>
  `;
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export function PublicLinkSharing({
  publicLink,
  sharingMessage,
  publicLinkMessage,
}: {
  publicLink: string;
  sharingMessage: string;
  publicLinkMessage: string;
}) {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <p>
        <span class="badge color-green3 me-1">Public source</span>
        {sharingMessage}
      </p>
      <div class="mb-3">
        <label for="publicLink">Public link</label>
        <InputGroup>
          <Form.Control type="text" id="publicLink" value={publicLink} disabled />
          <OverlayTrigger overlay={<Tooltip>{copied ? 'Copied!' : 'Copy'}</Tooltip>}>
            <Button
              size="sm"
              variant="outline-secondary"
              aria-label="Copy public link"
              onClick={async () => {
                await copyToClipboard(publicLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <i class="far fa-clipboard" />
            </Button>
          </OverlayTrigger>
          <Button
            size="sm"
            variant="outline-secondary"
            aria-label="Public Link QR Code"
            onClick={() => setShowQR(true)}
          >
            <i class="fas fa-qrcode" />
          </Button>
        </InputGroup>
        <small class="form-text text-muted">{publicLinkMessage}</small>
      </div>
      <QRCodeModal
        id="publicLinkModal"
        title="Public Link QR Code"
        content={publicLink}
        show={showQR}
        onHide={() => setShowQR(false)}
      />
    </>
  );
}

export function StudentLinkSharing({
  studentLink,
  studentLinkMessage,
}: {
  studentLink: string;
  studentLinkMessage: string;
}) {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div class="mb-3">
      <label class="form-label" for="student_link">
        Student Link
      </label>
      <InputGroup>
        <Form.Control type="text" id="student_link" value={studentLink} disabled />
        <OverlayTrigger overlay={<Tooltip>{copied ? 'Copied!' : 'Copy'}</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            aria-label="Copy student link"
            onClick={async () => {
              await copyToClipboard(studentLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <i class="bi bi-clipboard" />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger overlay={<Tooltip>View QR Code</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            aria-label="Student Link QR Code"
            onClick={() => setShowQR(true)}
          >
            <i class="bi bi-qr-code-scan" />
          </Button>
        </OverlayTrigger>
      </InputGroup>
      <small class="form-text text-muted">{studentLinkMessage}</small>
      <QRCodeModal
        id="studentLinkModal"
        title="Student Link QR Code"
        content={studentLink}
        show={showQR}
        onHide={() => setShowQR(false)}
      />
    </div>
  );
}

export function StudentLinkSharingHtml({
  studentLink,
  studentLinkMessage,
}: {
  studentLink: string;
  studentLinkMessage: string;
}) {
  return html`
    <div class="mb-3">
      <label class="form-label" for="student_link">Student Link</label>
      <span class="input-group">
        <input
          type="text"
          class="form-control"
          id="student_link"
          name="student_link"
          value="${studentLink}"
          disabled
        />
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary btn-copy"
          data-clipboard-text="${studentLink}"
          aria-label="Copy student link"
        >
          <i class="far fa-clipboard"></i>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          aria-label="Student Link QR Code"
          data-bs-toggle="modal"
          data-bs-target="#studentLinkModal"
        >
          <i class="fas fa-qrcode"></i>
        </button>
      </span>
      <small class="form-text text-muted"> ${studentLinkMessage} </small>
    </div>
  `;
}
