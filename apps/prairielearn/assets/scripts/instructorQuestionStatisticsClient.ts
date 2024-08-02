import { onDocumentReady } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';

onDocumentReady(() => {
  $('[data-toggle="popover"]').popover({ sanitize: false });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});
