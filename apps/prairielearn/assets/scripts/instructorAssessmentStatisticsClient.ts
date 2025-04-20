import { onDocumentReady } from '@prairielearn/browser-utils';

import { histogram } from './lib/histogram.js';
import { parallelHistograms } from './lib/parallelHistograms.js';
import { scatter } from './lib/scatter.js';

onDocumentReady(() => {
  document.querySelectorAll<HTMLElement>('.js-histogram').forEach((element) => histogram(element));
  document.querySelectorAll<HTMLElement>('.js-scatter').forEach((element) => scatter(element));
  document
    .querySelectorAll<HTMLElement>('.js-parallel-histograms')
    .forEach((element) => parallelHistograms(element));
});
