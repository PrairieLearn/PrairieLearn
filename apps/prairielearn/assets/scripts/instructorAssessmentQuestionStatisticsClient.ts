import { onDocumentReady } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';
import { scatter } from './lib/scatter.js';

onDocumentReady(() => {
  $(function () {
    $('[data-toggle="popover"]').popover({ sanitize: false });
  });

  document.querySelectorAll<HTMLElement>('.js-scatter').forEach((element) => {
    const { xdata, ydata, options } = element.dataset;
    scatter(
      element,
      JSON.parse(xdata ?? '[]'),
      JSON.parse(ydata ?? '[]'),
      JSON.parse(options ?? '{}'),
    );
  });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => {
    const { data, options } = element.dataset;
    histmini(element, JSON.parse(data ?? '[]'), JSON.parse(options ?? '{}'));
  });
});
