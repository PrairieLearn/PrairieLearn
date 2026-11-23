/**
 * Waits until no element under `source` has `data-pl-render-status="pending"`. Elements are
 * re-queried on every change, so pending elements that are inserted later are also awaited.
 */
export function waitForPrintableElements(source: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(check);
    const timeout = window.setTimeout(
      () => finish(new Error('Timed out waiting for printable elements to render')),
      60_000,
    );

    function finish(error?: Error) {
      observer.disconnect();
      window.clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    }

    function check() {
      if (source.querySelector('[data-pl-render-status="error"]')) {
        finish(new Error('A printable element could not be rendered'));
      } else if (!source.querySelector('[data-pl-render-status="pending"]')) {
        finish();
      }
    }

    observer.observe(source, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['data-pl-render-status'],
    });
    check();
  });
}
