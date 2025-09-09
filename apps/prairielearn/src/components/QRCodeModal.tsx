import { useMemo } from 'preact/compat';
import QR from 'qrcode-svg';
import { Modal } from 'react-bootstrap';

import { html, unsafeHtml } from '@prairielearn/html';

import { Modal as HtmlModal } from './Modal.js';

export function QRCodeModalHtml({
  id,
  title,
  content,
}: {
  id: string;
  title: string;
  content: string;
}) {
  const qrCodeSvg = new QR({ content, container: 'svg-viewbox' }).svg();

  return HtmlModal({
    id,
    title,
    form: false,
    body: html`<div class="d-flex" style="max-height: 80vh;">${unsafeHtml(qrCodeSvg)}</div>`,
  });
}

export function QRCodeModal({
  id,
  title,
  content,
  show,
  onHide,
}: {
  id: string;
  title: string;
  content: string;
  show: boolean;
  onHide: () => void;
}) {
  const svg = useMemo(() => new QR({ content, container: 'svg-viewbox' }).svg(), [content]);
  return (
    <Modal show={show} aria-labelledby={`${id}-title`} backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title id={`${id}-title`}>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div class="d-flex" style="max-height: 80vh;">
          {/* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml */}
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </Modal.Body>
    </Modal>
  );
}
