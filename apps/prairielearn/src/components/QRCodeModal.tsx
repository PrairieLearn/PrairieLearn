import QR from 'qrcode-svg';

import { html, unsafeHtml } from '@prairielearn/html';

import { Modal } from './Modal.js';

export function QRCodeModal({
  id,
  title,
  content,
}: {
  id: string;
  title: string;
  content: string;
}) {
  const qrCodeSvg = new QR({ content, container: 'svg-viewbox' }).svg();

  return Modal({
    id,
    title,
    form: false,
    body: html`<div class="d-flex" style="max-height: 80vh;">${unsafeHtml(qrCodeSvg)}</div>`,
  });
}
