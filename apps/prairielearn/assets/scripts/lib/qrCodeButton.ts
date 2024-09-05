import QR from 'qrcode-svg';
import { observe } from 'selector-observer';

import { onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';

observe('.js-qrcode-button', {
  add(el) {
    if (!(el instanceof HTMLElement)) return;

    const content = el.dataset.qrCodeContent;
    if (content) {
      const qrCodeSvg = new QR({ content, width: 512, height: 512 }).svg();

      // BS5 delays the initialization of popovers until the document load, so
      // delay until that happens. Once we're no longer supporting BS4, this can
      // be replaced with a proper BS5 API call.
      onDocumentReady(() => {
        // The `data-content` attribute appears to not support SVGs, so we need
        // to manually initialize the popover with the SVG content.
        $(el).popover({
          content: parseHTMLElement(document, qrCodeSvg),
          html: true,
          trigger: 'click',
          container: 'body',
        });
      });
    }
  },
});
