import { onDocumentReady } from '@prairielearn/browser-utils';

import { histogram } from './lib/histogram';
import { scatter } from './lib/scatter';
import { parallel_histograms } from './lib/parallel_histograms';

onDocumentReady(() => {
  document.querySelectorAll('.js-histogram').forEach((histogramElement) => {
    const histogramHtmlElement = histogramElement as HTMLElement;
    const data = JSON.parse(histogramHtmlElement.dataset.histogram ?? '');
    const xgrid = JSON.parse(histogramHtmlElement.dataset.xgrid ?? '');
    const options = JSON.parse(histogramHtmlElement.dataset.options ?? '');
    histogram(histogramElement, data, xgrid, options);
  });

  document.querySelectorAll('.js-scatter').forEach((scatterElement) => {
    const scatterHtmlElement = scatterElement as HTMLElement;
    const xdata = JSON.parse(scatterHtmlElement.dataset.xdata ?? '');
    const ydata = JSON.parse(scatterHtmlElement.dataset.ydata ?? '');
    const options = JSON.parse(scatterHtmlElement.dataset.options ?? '');
    scatter(scatterElement, xdata, ydata, options);
  });

  document.querySelectorAll('.js-parallel-histograms').forEach((parallelHistogramsElement) => {
    const parallelHistogramsHtmlElement = parallelHistogramsElement as HTMLElement;
    const data = JSON.parse(parallelHistogramsHtmlElement.dataset.histograms ?? '');
    const options = JSON.parse(parallelHistogramsHtmlElement.dataset.options ?? '');
    parallel_histograms(parallelHistogramsElement, data, options);
  });
});
