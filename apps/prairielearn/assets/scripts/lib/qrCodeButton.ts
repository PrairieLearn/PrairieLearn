import QR from 'qrcode-svg';

import { onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const el = document.querySelector('.js-qrcode-button') as HTMLElement;
  const content = el.dataset.qrCodeContent;
  if (!content) return;
  const qrCodeSvg = new QR({ content, container: 'svg-viewbox' }).svg();
  new window.bootstrap.Popover(el, {
    content: parseHTMLElement(document, qrCodeSvg),
    html: true,
    trigger: 'click',
    container: 'body',
    customClass: 'popover-narrow-fixed',
  });
});
