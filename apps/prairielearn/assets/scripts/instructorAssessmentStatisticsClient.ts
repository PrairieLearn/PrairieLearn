import { onDocumentReady } from '@prairielearn/browser-utils';

import { histogram } from './lib/histogram.js';
import { parallelHistograms } from './lib/parallelHistograms.js';
import { scatter } from './lib/scatter.js';

onDocumentReady(() => {
  document.querySelectorAll<HTMLElement>('.js-histogram').forEach((histogramElement) => {
    const data = JSON.parse(histogramElement.dataset.histogram ?? '');
    const xgrid = JSON.parse(histogramElement.dataset.xgrid ?? '');
    const options = JSON.parse(histogramElement.dataset.options ?? '');
    histogram(histogramElement, data, xgrid, options);
  });

  document.querySelectorAll<HTMLElement>('.js-scatter').forEach((scatterElement) => {
    const xdata = JSON.parse(scatterElement.dataset.xdata ?? '');
    const ydata = JSON.parse(scatterElement.dataset.ydata ?? '');
    const options = JSON.parse(scatterElement.dataset.options ?? '');
    scatter(scatterElement, xdata, ydata, options);
  });

  document
    .querySelectorAll<HTMLElement>('.js-parallel-histograms')
    .forEach((parallelHistogramsElement) => {
      const data = JSON.parse(parallelHistogramsElement.dataset.histograms ?? '');
      const options = JSON.parse(parallelHistogramsElement.dataset.options ?? '');
      parallelHistograms(parallelHistogramsElement, data, options);
    });
});
