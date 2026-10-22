import type { DocxSource } from '../printing/docx-browser.js';

export interface PrintSnapshot {
  id: string;
  html: string;
  source: DocxSource;
}

export const STALE_PRINT_SNAPSHOT_MESSAGE =
  'This print preview has expired or changed. Select Update preview and try again.';

/** Save the pages exactly as the instructor sees them, before handing them to an exporter. */
export function capturePrintSnapshot(doc: Document): PrintSnapshot {
  const root = doc.documentElement;
  if (root.dataset.printStatus !== 'ready') {
    throw new Error('The printable preview is not ready.');
  }
  const sourceText = doc.getElementById('pl-print-docx-source')?.textContent;
  const source = sourceText ? (JSON.parse(sourceText) as DocxSource) : undefined;
  if (!source) throw new Error('The preview did not capture editable question content.');
  const id = root.dataset.printSnapshotId;
  if (!id) throw new Error('The printable preview has no snapshot ID.');

  const copy = root.cloneNode(true) as HTMLElement;
  copy.removeAttribute('data-print-snapshot-id');
  copy
    .querySelectorAll('script, noscript, iframe, meta[http-equiv="refresh"]')
    .forEach((element) => {
      element.remove();
    });
  return { id, html: `<!doctype html>\n${copy.outerHTML}`, source };
}

/** Lay out another form in an offscreen frame when it is needed for a download. */
async function renderInFrame<T>(
  url: string,
  capture: (doc: Document) => T | Promise<T>,
): Promise<T> {
  const frame = document.createElement('iframe');
  frame.title = 'Preparing printable document';
  frame.style.cssText =
    'position:fixed;left:-200vw;top:0;width:1200px;height:800px;border:0;pointer-events:none';
  let timeout: number | undefined;
  let observer: MutationObserver | undefined;
  const ready = new Promise<T>((resolve, reject) => {
    timeout = window.setTimeout(() => {
      reject(new Error('The printable preview is taking longer than expected.'));
    }, 120_000);
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      if (doc?.URL === 'about:blank') return;
      const root = doc?.documentElement;
      if (!root?.dataset.printStatus) {
        reject(new Error('The printable preview could not be loaded.'));
        return;
      }
      observer?.disconnect();
      const statusObserver = new MutationObserver(check);
      observer = statusObserver;
      statusObserver.observe(root, { attributes: true, attributeFilter: ['data-print-status'] });

      function check() {
        if (root?.dataset.printStatus === 'ready') {
          statusObserver.disconnect();
          try {
            void Promise.resolve(capture(frame.contentDocument!)).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
        } else if (root?.dataset.printStatus === 'error') {
          statusObserver.disconnect();
          reject(new Error(root.dataset.printError ?? 'Unable to lay out this exam.'));
        }
      }
      check();
    });
  });
  document.body.append(frame);
  frame.src = url;
  try {
    return await ready;
  } finally {
    window.clearTimeout(timeout);
    observer?.disconnect();
    frame.remove();
  }
}

/** Lay out another form in an offscreen frame when it is needed for a PDF. */
export async function renderPrintSnapshot(url: string): Promise<PrintSnapshot> {
  return await renderInFrame(url, capturePrintSnapshot);
}
