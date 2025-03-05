import QR from 'qrcode-svg';

import { unsafeHtml } from '@prairielearn/html';

import { Modal } from './Modal.html.js';

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
    body: unsafeHtml(qrCodeSvg),
  });
}
