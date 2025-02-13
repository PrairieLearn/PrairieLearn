import QR from 'qrcode-svg';
import { observe } from 'selector-observer';

import { onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  observe('.js-qrcode-button', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;
      const content = el.dataset.qrCodeContent;
      if (content) {
        const qrCodeSvg = new QR({ content, container: 'svg-viewbox' }).svg();
        new window.bootstrap.Popover(el, {
          content: parseHTMLElement(document, qrCodeSvg),
          html: true,
          trigger: 'click',
          container: 'body',
          customClass: 'popover-narrow-fixed',
        });
      }
    },
  });
});
