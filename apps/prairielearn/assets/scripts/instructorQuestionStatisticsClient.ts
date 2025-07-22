import { onDocumentReady } from '@prairielearn/browser-utils';

import { HistMiniHtml } from '../../src/components/HistMini.js';

onDocumentReady(() => {
  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => {
    HistMiniHtml({
      selector: element,
      data: JSON.parse(element.dataset.data ?? '[]'),
      options: JSON.parse(element.dataset.options ?? '{}'),
    });
  });
});
