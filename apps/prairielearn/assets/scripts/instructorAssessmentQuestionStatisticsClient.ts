import { onDocumentReady } from '@prairielearn/browser-utils';

import { scatter } from './lib/scatter.js';

onDocumentReady(() => {
  document.querySelectorAll<HTMLElement>('.js-scatter').forEach((scatterElement) => {
    console.log(scatterElement.dataset.xdata);
    const xdata = JSON.parse(scatterElement.dataset.xdata ?? '');
    const ydata = JSON.parse(scatterElement.dataset.ydata ?? '');
    const options = JSON.parse(scatterElement.dataset.options ?? '');
    scatter(scatterElement, xdata, ydata, options);
  });
});
