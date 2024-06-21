import { onDocumentReady } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';

onDocumentReady(() => {
  $(function () {
    $('[data-toggle="popover"]').popover({ sanitize: false });
  });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => {
    const { data, options } = element.dataset;
    histmini(element, JSON.parse(data ?? '[]'), JSON.parse(options ?? '{}'));
  });
});
