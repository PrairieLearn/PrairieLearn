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
  const qrCodeSvg = new QR({ content, container: 'svg-viewbox' })
    .svg()
    .replace('<svg ', '<svg style="width:100%;height:100%;" ');

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
  const svg = useMemo(
    () =>
      new QR({ content, container: 'svg-viewbox' })
        .svg()
        .replace('<svg ', '<svg style="width:100%;height:100%;" '),
    [content],
  );
  return (
    <Modal show={show} size="lg" aria-labelledby={`${id}-title`} backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title id={`${id}-title`}>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml */}
        <div className="d-flex" style="max-height: 80vh;" dangerouslySetInnerHTML={{ __html: svg }} />
      </Modal.Body>
    </Modal>
  );
}
