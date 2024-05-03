import { onDocumentReady } from '@prairielearn/browser-utils';

declare global {
  interface Window {
    histogram: any;
    scatter: any;
    parallel_histograms: any;
  }
}

onDocumentReady(() => {
  document.querySelectorAll('.histogram').forEach((histogramElement) => {
    const data = JSON.parse(histogramElement.getAttribute('data-histogram') ?? '');
    const xgrid = JSON.parse(histogramElement.getAttribute('data-xgrid') ?? '');
    const options = JSON.parse(histogramElement.getAttribute('data-options') ?? '');
    window.histogram(histogramElement, data, xgrid, options);
  });

  document.querySelectorAll('.scatter').forEach((scatterElement) => {
    const xdata = JSON.parse(scatterElement.getAttribute('data-xdata') ?? '');
    const ydata = JSON.parse(scatterElement.getAttribute('data-ydata') ?? '');
    const options = JSON.parse(scatterElement.getAttribute('data-options') ?? '');
    window.scatter(scatterElement, xdata, ydata, options);
  });

  document.querySelectorAll('.parallel_histograms').forEach((parallelHistogramsElement) => {
    const data = JSON.parse(parallelHistogramsElement.getAttribute('data-histograms') ?? '');
    const options = JSON.parse(parallelHistogramsElement.getAttribute('data-options') ?? '');
    window.parallel_histograms(parallelHistogramsElement, data, options);
  });
});
