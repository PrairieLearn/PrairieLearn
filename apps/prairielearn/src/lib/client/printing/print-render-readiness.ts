/**
 * Waits until no element under `source` has `data-pl-render-status="pending"`, or until
 * `timeoutMs` passes. Elements are re-queried on every change, so pending elements that are
 * inserted later are also awaited. Resolves with the elements that reported an error or are
 * still pending.
 */
export function waitForPrintableElements(
  source: HTMLElement,
  timeoutMs: number,
): Promise<HTMLElement[]> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(check);
    const timeout = window.setTimeout(finish, timeoutMs);

    function finish() {
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve([
        ...source.querySelectorAll<HTMLElement>(
          '[data-pl-render-status="error"], [data-pl-render-status="pending"]',
        ),
      ]);
    }

    function check() {
      if (!source.querySelector('[data-pl-render-status="pending"]')) finish();
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
