import { parseQuestionBlockSize } from '../../printing/question-block-size.js';

import { getPrintBlockHeight } from './print-question-layout.js';

const MIN_CHOICE_IMAGE_SCALE = 0.5;

/**
 * Waits for every image under `source`, including in shadow roots, to load and decode, or until
 * `timeoutMs` passes. Resolves with the images that failed or did not finish in time.
 */
export async function waitForPrintImages(
  source: HTMLElement,
  timeoutMs: number,
): Promise<HTMLImageElement[]> {
  const images: HTMLImageElement[] = [];
  const collectImages = (root: ParentNode) => {
    images.push(...root.querySelectorAll<HTMLImageElement>('img'));
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) collectImages(element.shadowRoot);
    }
  };
  collectImages(source);

  const timedOut = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  const loaded = await Promise.all(
    images.map(async (image) => {
      // Image capture placeholders have no source until a student acts. Images selected through
      // srcset or a picture source still need to finish loading before pagination.
      if (!image.currentSrc && !image.getAttribute('src') && !image.getAttribute('srcset')) {
        return true;
      }
      if (image.loading === 'lazy') image.loading = 'eager';
      const load = async () => {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          });
        }
        if (image.naturalWidth === 0) return false;
        return await image.decode().then(
          () => true,
          () => false,
        );
      };
      return await Promise.race([load(), timedOut]);
    }),
  );
  return images.filter((_, index) => !loaded[index]);
}

/** Fit image choices together without changing the size of question text or answer markers. */
export function fitPrintChoiceImages(questions: Iterable<HTMLElement>, pageHeight: number): void {
  for (const question of questions) {
    // Leave room for rounding when Paged.js reconstructs the measured content.
    const availableHeight =
      getPrintBlockHeight(parseQuestionBlockSize(question.dataset.printBlockSize), pageHeight) - 2;
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
    // planner handle the long question.
    scaleImages(0);
    if (question.getBoundingClientRect().height > availableHeight) {
      restoreImages();
      continue;
    }

    // Keep individual images within a page, but let a long list of choices flow across pages
    // rather than shrinking every image until the entire question fits on one page.
    const minimumScale = Math.min(
      MIN_CHOICE_IMAGE_SCALE,
      ...images.map(({ bounds }) => (pageHeight - 48) / bounds.height),
    );
    scaleImages(minimumScale);
    if (question.getBoundingClientRect().height > availableHeight) continue;

    // Measure the real layout, including captions, wrapping, and option spacing. A common
    // scale preserves equal image sizes and any intentionally different proportions.
    let lower = minimumScale;
    let upper = 1;
    for (let iteration = 0; iteration < 12; iteration++) {
      const scale = (lower + upper) / 2;
      scaleImages(scale);
      if (question.getBoundingClientRect().height <= availableHeight) lower = scale;
      else upper = scale;
    }
    scaleImages(lower);
  }
}
