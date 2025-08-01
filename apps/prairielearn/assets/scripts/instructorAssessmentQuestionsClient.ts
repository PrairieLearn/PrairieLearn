import { onDocumentReady } from '@prairielearn/browser-utils';

import { renderHistMini } from '../../src/components/HistMini.js';

onDocumentReady(() => {
  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) =>
    renderHistMini({
      element,
      data: JSON.parse(element.dataset.data ?? '[]'),
      options: JSON.parse(element.dataset.options ?? '{}'),
    }),
  );
});
