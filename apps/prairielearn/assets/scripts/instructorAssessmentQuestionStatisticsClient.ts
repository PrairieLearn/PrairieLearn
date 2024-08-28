import { onDocumentReady } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';
import { scatter } from './lib/scatter.js';

onDocumentReady(() => {
  document.querySelectorAll<HTMLElement>('.js-scatter').forEach((element) => scatter(element));
  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});
