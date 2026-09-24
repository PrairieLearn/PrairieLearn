import { getPrintBlockHeight, parsePrintBlockSize } from './print-question-layout.js';

/** Fit image choices together without changing the size of question text or answer markers. */
export function fitPrintChoiceImages(questions: Iterable<HTMLElement>, pageHeight: number): void {
  for (const question of questions) {
    // Leave room for rounding when Paged.js reconstructs the measured content.
    const availableHeight =
      getPrintBlockHeight(parsePrintBlockSize(question.dataset.printBlockSize), pageHeight) - 2;
    if (question.getBoundingClientRect().height <= availableHeight) continue;

    const images = [
      ...question.querySelectorAll<HTMLImageElement>(
        '.printing-selection-option img, .printing-choice-list img',
      ),
    ]
      .map((image) => ({
        image,
        bounds: image.getBoundingClientRect(),
        originalStyle: image.getAttribute('style'),
      }))
      .filter(({ bounds }) => bounds.width > 0 && bounds.height > 0);
    if (images.length === 0) continue;

    const scaleImages = (scale: number) => {
      for (const { image, bounds } of images) {
        image.style.width = `${bounds.width * scale}px`;
        image.style.height = `${bounds.height * scale}px`;
      }
    };
    const restoreImages = () => {
      for (const { image, originalStyle } of images) {
        if (originalStyle === null) image.removeAttribute('style');
        else image.setAttribute('style', originalStyle);
      }
    };

    // If the text alone cannot fit, retain the authored images and let the existing page
    // planner handle the long question (or report that its requested block is too small).
    scaleImages(0);
    if (question.getBoundingClientRect().height > availableHeight) {
      restoreImages();
      continue;
    }

    // Measure the real layout, including captions, wrapping, and option spacing. A common
    // scale preserves equal image sizes and any intentionally different proportions.
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < 12; iteration++) {
      const scale = (lower + upper) / 2;
      scaleImages(scale);
      if (question.getBoundingClientRect().height <= availableHeight) lower = scale;
      else upper = scale;
    }
    if (lower === 0) restoreImages();
    else scaleImages(lower);
  }
}
