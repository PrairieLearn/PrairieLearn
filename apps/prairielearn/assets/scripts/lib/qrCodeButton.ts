import QR from 'qrcode-svg';
import { observe } from 'selector-observer';

import { parseHTMLElement } from '@prairielearn/browser-utils';

observe('.js-qrcode-button', {
  add(el) {
    if (!(el instanceof HTMLElement)) return;

    const content = el.dataset.qrCodeContent;
    if (content) {
      const qrCodeSvg = new QR({ content, width: 512, height: 512 }).svg();

      // The `data-content` attribute appears to not support SVGs, so we need
      // to manually initialize the popover with the SVG content.
      $(el).popover({
        content: parseHTMLElement(document, qrCodeSvg),
        html: true,
        trigger: 'click',
        container: 'body',
      });
    }
  },
});
