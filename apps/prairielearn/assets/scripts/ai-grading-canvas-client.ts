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
  const source = document.body;
  await window.MathJax.startup.promise;
  await waitForQuestionRendering();
  await waitForPrintableElements(source);
  await waitForExcalidrawCanvases(source);
  await document.fonts.ready;
  // External images are blocked in the browser and loaded by the existing grading image loader.
  await waitForPrintImages(source, { sameOriginOnly: true });
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
  // Question elements can explicitly typeset math even with startup typesetting disabled.
  // Restore their TeX before HTML cleanup removes MathJax's SVG output.
  for (const item of window.MathJax.startup.document.math as Iterable<{
    typesetRoot?: Element;
    math: string;
    display: boolean;
  }>) {
    if (item.typesetRoot?.isConnected) {
      item.typesetRoot.replaceWith(
        document.createTextNode(item.display ? `\\[${item.math}\\]` : `\\(${item.math}\\)`),
      );
    }
  }
  document.documentElement.dataset.printStatus = 'ready';
}

void prepareCanvases().catch((error: unknown) => {
  document.documentElement.dataset.printError =
    error instanceof Error ? error.message : String(error);
  document.documentElement.dataset.printStatus = 'error';
});
