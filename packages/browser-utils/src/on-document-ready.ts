export function onDocumentReady(fn: () => void): void {
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      fn();
    });
  }
}
