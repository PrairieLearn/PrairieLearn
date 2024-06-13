import QR from 'qrcode-svg';

import { onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  document.querySelectorAll<HTMLButtonElement>('.js-qrcode-button').forEach((button) => {
    const content = button.dataset.qrCodeContent;
    if (content) {
      const qrCodeSvg = new QR({ content, width: 512, height: 512 }).svg();

      $(button).popover({
        content: parseHTMLElement(document, qrCodeSvg),
        html: true,
        trigger: 'click',
        container: 'body',
      });
    }
  });
});
