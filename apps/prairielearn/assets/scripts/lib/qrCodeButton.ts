import QR from 'qrcode-svg';
import { observe } from 'selector-observer';

import { onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';

import { Modal } from '../../../src/components/Modal.html.js';

onDocumentReady(() => {
  observe('.js-qrcode-button', {
    constructor: HTMLElement,
    add(el) {
      const content = el.dataset.qrCodeContent;
      if (!content) return;

      const qrCodeSvg = new QR({ content, container: 'svg-viewbox' }).svg();

      const modal = Modal({
        id: 'qr-code-modal',
        title: 'QR Code',
        body: qrCodeSvg,
      });
      new window.bootstrap.Popover(el, {
        content: parseHTMLElement(document, qrCodeSvg),
        html: true,
        trigger: 'click',
        container: 'body',
        customClass: 'popover-narrow-fixed',
      });
    },
  });
});
