import { onDocumentReady } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';

onDocumentReady(() => {
  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});
