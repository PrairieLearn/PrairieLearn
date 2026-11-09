import '../../src/lib/client/mathjax.js';

import {
  waitForExcalidrawCanvases,
  waitForPrintImages,
} from '../../src/lib/client/printing/print-image-layout.js';
import { waitForPrintableElements } from '../../src/lib/client/printing/print-render-readiness.js';
import {
  replaceCanvasesWithImages,
  waitForQuestionRendering,
} from '../../src/lib/client/question-rendering.js';

// Preserve authored math in the text prompt while allowing drawing labels to render.
window.MathJax.startup.typeset = false;

async function prepareCanvases(): Promise<void> {
  if (document.readyState !== 'complete') {
    await new Promise<void>((resolve) =>
      window.addEventListener('load', () => resolve(), { once: true }),
    );
  }
  // jQuery schedules ready callbacks in a separate task, including pl-drawing initialization.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  const source = document.getElementById('ai-grading-source')!;
  await window.MathJax.startup.promise;
  await waitForQuestionRendering();
  await waitForPrintableElements(source);
  await waitForExcalidrawCanvases(source);
  await document.fonts.ready;
  await waitForPrintImages(source);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  await waitForQuestionRendering();
  if (document.documentElement.dataset.printStatus === 'error') {
    throw new Error(document.documentElement.dataset.printError);
  }
  replaceCanvasesWithImages(source, {
    maxPixels: 16_000_000,
    maxTotalBytes: 10 * 1024 * 1024,
    maxCanvases: 32,
  });
  document.documentElement.dataset.printStatus = 'ready';
}

void prepareCanvases().catch((error: unknown) => {
  document.documentElement.dataset.printError =
    error instanceof Error ? error.message : String(error);
  document.documentElement.dataset.printStatus = 'error';
});
