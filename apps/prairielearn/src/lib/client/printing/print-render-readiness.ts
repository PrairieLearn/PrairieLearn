export function waitForPrintableElements(source: HTMLElement): Promise<void> {
  const elements = [...source.querySelectorAll<HTMLElement>('[data-pl-render-status]')];
  if (elements.length === 0) return Promise.resolve();

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
      if (elements.some((element) => element.dataset.plRenderStatus === 'error')) {
        finish(new Error('A printable element could not be rendered'));
      } else if (elements.every((element) => element.dataset.plRenderStatus === 'ready')) {
        finish();
      }
    }

    observer.observe(source, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-pl-render-status'],
    });
    check();
  });
}
