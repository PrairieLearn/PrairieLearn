import { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import { QRCodeModal } from './QRCodeModal.js';

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
        <span className="badge color-green3 me-1">Public source</span>
        {sharingMessage}
      </p>
      <div className="mb-3">
        <label htmlFor="publicLink">Public link</label>
        <InputGroup>
          <Form.Control type="text" id="publicLink" value={publicLink} disabled />
          <OverlayTrigger
            tooltip={{
              body: copied ? 'Copied!' : 'Copy',
              props: { id: 'public-link-copy-tooltip' },
            }}
          >
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
              <i className="far fa-clipboard" />
            </Button>
          </OverlayTrigger>
          <Button
            size="sm"
            variant="outline-secondary"
            aria-label="Public Link QR Code"
            onClick={() => setShowQR(true)}
          >
            <i className="fas fa-qrcode" />
          </Button>
        </InputGroup>
        <small className="form-text text-muted">{publicLinkMessage}</small>
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
    <div className="mb-3">
      <label className="form-label" htmlFor="student_link">
        Student link
      </label>
      <InputGroup>
        <Form.Control type="text" id="student_link" value={studentLink} disabled />
        <OverlayTrigger
          tooltip={{
            body: copied ? 'Copied!' : 'Copy',
            props: { id: 'student-link-copy-tooltip' },
          }}
        >
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
            <i className="bi bi-clipboard" />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger
          tooltip={{
            body: 'View QR Code',
            props: { id: 'student-link-qr-code-tooltip' },
          }}
        >
          <Button
            size="sm"
            variant="outline-secondary"
            aria-label="Student link QR code"
            onClick={() => setShowQR(true)}
          >
            <i className="bi bi-qr-code-scan" />
          </Button>
        </OverlayTrigger>
      </InputGroup>
      <small className="form-text text-muted">{studentLinkMessage}</small>
      <QRCodeModal
        id="studentLinkModal"
        title="Student link QR code"
        content={studentLink}
        show={showQR}
        onHide={() => setShowQR(false)}
      />
    </div>
  );
}
