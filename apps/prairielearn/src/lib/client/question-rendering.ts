declare global {
  interface Window {
    PrairieLearnAssessmentPrinting?: { waitUntil: (promise: Promise<unknown>) => void };
  }
}

/** Runs before question scripts, including when embedded in a server-rendered page. */
export function initializeQuestionRendering(reportErrors = false): void {
  const promises: Promise<unknown>[] = [];
  window.PrairieLearnAssessmentPrinting = {
    waitUntil(promise) {
      // Keep failures observable until the renderer consumes the registered work.
      void promise.catch(() => undefined);
      promises.push(promise);
    },
  };
  Reflect.set(window, '__PL_PRINT_READINESS_PROMISES__', promises);
  if (reportErrors) {
    window.addEventListener(
      'error',
      (event: Event) => {
        if (event instanceof ErrorEvent) {
          document.documentElement.dataset.printError = event.message;
        } else if (event.target instanceof HTMLScriptElement) {
          document.documentElement.dataset.printError = 'Could not load a question script';
        } else {
          return;
        }
        document.documentElement.dataset.printStatus = 'error';
      },
      { capture: true },
    );
    window.addEventListener('unhandledrejection', (event) => {
      document.documentElement.dataset.printError = String(event.reason);
      document.documentElement.dataset.printStatus = 'error';
    });
  }
}

/** Drain repeatedly because initialization can register more asynchronous drawing work. */
export async function waitForQuestionRendering(): Promise<void> {
  const promises = Reflect.get(window, '__PL_PRINT_READINESS_PROMISES__') as Promise<unknown>[];
  let consumed = 0;
  while (consumed < promises.length) {
    const pending = promises.slice(consumed);
    consumed = promises.length;
    await Promise.all(pending);
  }
}

export function replaceCanvasesWithImages(
  source: HTMLElement,
  {
    maxPixels = Infinity,
    maxTotalBytes = Infinity,
    maxCanvases = Infinity,
  }: { maxPixels?: number; maxTotalBytes?: number; maxCanvases?: number } = {},
): void {
  let count = 0;
  let totalBytes = 0;
  const replacements: { canvas: HTMLCanvasElement; image: HTMLImageElement }[] = [];
  const collect = (root: ParentNode) => {
    for (const canvas of root.querySelectorAll('canvas')) {
      if (canvas.width === 0 || canvas.height === 0) continue;
      if (++count > maxCanvases || canvas.width * canvas.height > maxPixels) {
        throw new Error('Canvas exceeds the rendering size limit');
      }
      const image = document.createElement('img');
      image.className = `${canvas.className} printing-canvas-image`;
      image.id = canvas.id;
      image.style.cssText = canvas.style.cssText;
      for (const attribute of [
        'aria-label',
        'aria-labelledby',
        'aria-describedby',
        'aria-description',
        'aria-hidden',
        'role',
      ]) {
        const value = canvas.getAttribute(attribute);
        if (value !== null) image.setAttribute(attribute, value);
      }
      const labelledBy = canvas.getAttribute('aria-labelledby');
      const description =
        labelledBy
          ?.split(/\s+/)
          .map(
            (id) =>
              (canvas.getRootNode() as Document | ShadowRoot).getElementById(id)?.textContent ?? '',
          )
          .join(' ')
          .trim() ||
        canvas.getAttribute('aria-label')?.trim() ||
        canvas.textContent.trim();
      if (description) image.alt = description;
      image.src = canvas.toDataURL('image/png');
      totalBytes += ((image.src.split(',')[1]?.length ?? 0) * 3) / 4;
      if (totalBytes > maxTotalBytes) {
        throw new Error('Canvas images exceed the rendering size limit');
      }
      const bounds = canvas.getBoundingClientRect();
      image.width = bounds.width || canvas.width;
      image.height = bounds.height || canvas.height;
      replacements.push({ canvas, image });
    }
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) collect(element.shadowRoot);
    }
  };
  collect(source);
  // Capture every surface before changing the layout or detaching a drawing library's canvas.
  for (const { canvas, image } of replacements) canvas.replaceWith(image);
}
